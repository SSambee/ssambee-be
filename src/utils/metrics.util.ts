// Prometheus Remote Write
import os from 'node:os';
import { compressSync } from 'snappy';

interface MetricsConfig {
  url: string;
  username: string;
  apiKey: string;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
  Protobuf 코어 인코더 계층
  외부 라이브러리 없이 그라파나 클라우드가 원하는 Protobuf 규격의 바이트 배열을 직접 생성합니다.
*/
function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return buf;
}

function encodeVarint(value: number | bigint): Uint8Array {
  const bytes: number[] = [];
  let v = BigInt(value);
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v) & 0x7f);
  return new Uint8Array(bytes);
}

function encodeField(tag: number, wireType: number): Uint8Array {
  return encodeVarint((tag << 3) | wireType);
}

function encodeString(tag: number, value: string): Uint8Array {
  const data = new TextEncoder().encode(value);
  return wrapMessage(tag, data);
}

function encodeDouble(tag: number, value: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setFloat64(0, value, true); // Protobuf는 Little-endian을 사용
  return concat(encodeField(tag, 1), buf);
}

function encodeInt64(tag: number, value: number): Uint8Array {
  return concat(encodeField(tag, 0), encodeVarint(value));
}

/** 포함된 메시지 (Embedded Message)나 배열(Repeated) 요소를 감쌀 때 사용한다.  */
function wrapMessage(tag: number, messageBytes: Uint8Array): Uint8Array {
  return concat(
    encodeField(tag, 2),
    encodeVarint(messageBytes.length),
    messageBytes,
  );
}

/** 
  Prometheus 도메인 빌더 계층
  Protobuf 코어를 활용해 Prometheus 메트릭 구조를 조립한다.
*/
function buildLabel(name: string, value: string): Uint8Array {
  const inner = concat(encodeString(1, name), encodeString(2, value));
  return wrapMessage(1, inner); // TimeSeries 내에서 Label은 1번 태그
}

function buildSample(value: number, timestampMs: number): Uint8Array {
  const inner = concat(encodeDouble(1, value), encodeInt64(2, timestampMs));
  return wrapMessage(2, inner); // TimeSeries 내에서 Sample은 2번 태그
}

function buildTimeSeries(
  labels: [string, string][],
  value: number,
  timestampMs: number,
): Uint8Array {
  // repeated 구조에 맞게 배열의 각 요소를 개별적으로 직렬화 후 이어붙인다.
  const labelBytes = concat(...labels.map(([n, v]) => buildLabel(n, v)));
  const sampleBytes = buildSample(value, timestampMs);

  const inner = concat(labelBytes, sampleBytes);
  return wrapMessage(1, inner); // WriteRequest 내에서 TimeSeries는 1번 태그
}

/**
  시스템 메트릭 수집 및 페이로드 생성
 */
function buildRemoteWritePayload(): Uint8Array {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown';
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const now = Date.now();

  // 시스템 전체 CPU 사용량(퍼센트) 계산
  const totalTick = { idle: 0, total: 0 };
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick.total += cpu.times[type];
    }
    totalTick.idle += cpu.times.idle;
  }
  const cpuUsagePercent =
    totalTick.total > 0
      ? ((totalTick.total - totalTick.idle) / totalTick.total) * 100
      : 0;

  const activeHandles = (
    process as unknown as { _getActiveHandles(): unknown[] }
  )._getActiveHandles().length;

  const baseLabels: [string, string][] = [
    ['job', 'ssambee-be'],
    ['env', env],
  ];

  const series = [
    { name: 'app_memory_rss_bytes', value: mem.rss },
    { name: 'app_memory_heap_used_bytes', value: mem.heapUsed },
    { name: 'app_memory_heap_total_bytes', value: mem.heapTotal },
    { name: 'system_memory_free_bytes', value: os.freemem() },
    { name: 'system_memory_total_bytes', value: os.totalmem() },
    { name: 'system_memory_used_bytes', value: os.totalmem() - os.freemem() },
    { name: 'system_cpu_usage_percent', value: cpuUsagePercent },
    { name: 'system_cpu_count', value: cpus.length },
    { name: 'process_uptime_seconds', value: Math.floor(process.uptime()) },
    { name: 'node_active_handles', value: activeHandles },
  ];

  // 모든 TimeSeries를 하나의 WriteRequest 바이트 배열로 결합
  return concat(
    ...series.map((s) =>
      buildTimeSeries([...baseLabels, ['__name__', s.name]], s.value, now),
    ),
  );
}

/**
  전송 및 라이프사이클 관리 
 */
async function pushMetrics(config: MetricsConfig): Promise<void> {
  const payload = buildRemoteWritePayload();
  const compressed = compressSync(payload); // Prometheus Remote Write는 snappy 압축을 사용

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-protobuf',
      'Content-Encoding': 'snappy',
      'X-Prometheus-Remote-Write-Version': '0.1.0',
      Authorization:
        'Basic ' +
        Buffer.from(`${config.username}:${config.apiKey}`).toString('base64'),
    },
    body: Buffer.from(compressed),
  });

  if (!response.ok) {
    throw new Error(
      `Grafana push failed: ${response.status} ${await response.text()}`,
    );
  }
}

async function collectAndPush(config: MetricsConfig): Promise<void> {
  try {
    await pushMetrics(config);
  } catch (error) {
    console.error('[Metrics] push error:', error);
  }
}

export function startMetricsCollection(): void {
  const url = process.env.GRAFANA_CLOUD_URL;
  const username = process.env.GRAFANA_CLOUD_USERNAME;
  const apiKey = process.env.GRAFANA_CLOUD_API_KEY;

  if (!url || !username || !apiKey) {
    console.log('[Metrics] Grafana Cloud env not set, skipping');
    return;
  }

  const config: MetricsConfig = { url, username, apiKey };

  // 초기 1회 즉시 실행
  collectAndPush(config);

  // 60초 주기로 수집 및 전송 반복
  intervalId = setInterval(() => collectAndPush(config), 60_000);
  intervalId.unref?.(); // 메트릭 루프 때문에 Node.js 프로세스가 종료되지 않는 현상 방지

  console.log('[Metrics] Grafana Cloud push started (60s interval)');
}

export function stopMetricsCollection(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Metrics] Grafana Cloud push stopped');
  }
}
