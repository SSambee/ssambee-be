// BE Loki 통합 검증 스크립트
// 프로덕션 API에 요청 보내서 Morgan + error 로그가 Loki에 도착하는지 확인

const LOKI_HOST = process.env.LOKI_HOST;
const LOKI_USER = process.env.LOKI_USER;
const LOKI_PASSWORD = process.env.LOKI_PASSWORD;
const BE_URL = process.env.BE_URL || 'https://api.ssambee.com';

if (!LOKI_HOST || !LOKI_USER || !LOKI_PASSWORD) {
  console.error('LOKI_HOST, LOKI_USER, LOKI_PASSWORD env vars required');
  console.error('Usage: LOKI_HOST=... LOKI_USER=... LOKI_PASSWORD=... node k6/test-loki.mjs');
  process.exit(1);
}

const authHeader =
  'Basic ' + Buffer.from(`${LOKI_USER}:${LOKI_PASSWORD}`).toString('base64');

const now = Date.now();

// ── 1. Loki에 직접 테스트 로그 push (연결 확인) ─────────────
async function pushDirectLog() {
  console.log('\n── Step 1: Loki 직접 push 테스트 ──');

  const ts = (now * 1_000_000).toString();
  const res = await fetch(`${LOKI_HOST}/loki/api/v1/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify({
      streams: [
        {
          stream: { app: 'ssambee-backend', env: 'production' },
          values: [
            [
              ts,
              JSON.stringify({
                level: 'info',
                message: '🧪 BE Loki 직접 push 테스트',
                test: true,
              }),
            ],
          ],
        },
      ],
    }),
  });

  console.log(`  Push status: ${res.status}`);
  console.log(`  ${res.status === 204 ? '✅ 연결 정상' : '❌ 실패'}`);
  return res.status === 204;
}

// ── 2. BE API에 요청 보내서 Morgan 로그 트리거 ──────────────
async function triggerBeLogs() {
  console.log('\n── Step 2: BE API 요청 → 로그 트리거 ──');

  const endpoints = [
    {
      name: '404 (존재하지 않는 경로)',
      url: `${BE_URL}/api/nonexistent-test-path`,
      expect: 404,
    },
    {
      name: '로그인 실패 (잘못된 credentials)',
      url: `${BE_URL}/api/public/v1/auth/signin`,
      method: 'POST',
      body: {
        email: 'loki-test@nonexistent.co.kr',
        password: 'wrongpassword1',
        userType: 'INSTRUCTOR',
      },
      expect: [400, 401, 404],
    },
    {
      name: 'mgmt 권한 없음 (401/403)',
      url: `${BE_URL}/api/mgmt/v1/lectures`,
      expect: [401, 403],
    },
  ];

  for (const ep of endpoints) {
    const opts = {
      method: ep.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
    };
    if (ep.body) opts.body = JSON.stringify(ep.body);

    const res = await fetch(ep.url, opts);
    const expected = Array.isArray(ep.expect)
      ? ep.expect.includes(res.status)
      : res.status === ep.expect;
    const icon = expected ? '✅' : '⚠️';
    console.log(`  ${icon} ${ep.name} → ${res.status}`);
  }
}

// ── 3. Loki에서 BE 로그 조회 ───────────────────────────────
async function queryLoki() {
  console.log('\n── Step 3: Loki에서 BE 로그 조회 ──');

  // 최근 5분 로그 조회
  const start = (now - 5 * 60 * 1000) * 1_000_000;
  const end = now * 1_000_000;

  const query = '{app="ssambee-backend"}';
  const url = `${LOKI_HOST}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${start}&end=${end}&limit=20&direction=backward`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (res.status !== 200) {
    console.log(`  ❌ Loki query failed: ${res.status}`);
    return;
  }

  const data = await res.json();
  const streams = data.data?.result || [];

  if (streams.length === 0) {
    console.log('  ⚠️ BE 로그 없음 — 아직 프로덕션에서 로그가 안 오거나 Morgan→Loki 경로 미작동');
    return;
  }

  console.log(`  ✅ ${streams.length}개 스트림 발견`);
  for (const stream of streams) {
    const labels = stream.stream;
    const values = stream.values || [];
    console.log(
      `  [env=${labels.env}] ${values.length}개 로그`,
    );
    // 최근 3개만 출력
    for (const [ts, line] of values.slice(0, 3)) {
      try {
        const parsed = JSON.parse(line);
        console.log(`    ${parsed.level || '?'} ${parsed.message || line.slice(0, 80)}`);
      } catch {
        console.log(`    ${line.slice(0, 80)}`);
      }
    }
  }
}

// ── Run ─────────────────────────────────────────────────────
async function main() {
  console.log(`BE URL: ${BE_URL}`);
  console.log(`Loki:  ${LOKI_HOST}`);

  await pushDirectLog();
  await triggerBeLogs();

  console.log('\n⏳ 5초 대기 (Loki 전파 지연)...');
  await new Promise((r) => setTimeout(r, 5000));

  await queryLoki();
  console.log('\n✅ 테스트 완료');
}

main().catch(console.error);
