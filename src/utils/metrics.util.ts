import os from 'node:os';
import { compressSync } from 'snappy';

interface MetricsConfig {
  url: string;
  username: string;
  apiKey: string;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

// 최소 Protobuf 인코더 — Prometheus Remote Write용
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
  const parts = [encodeField(tag, 2), encodeVarint(data.length), data];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return buf;
}

function encodeDouble(tag: number, value: number): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setFloat64(0, value, true);
  const parts = [encodeField(tag, 1), buf];
  const result = new Uint8Array(10);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

function encodeInt64(tag: number, value: number): Uint8Array {
  return concat(encodeField(tag, 0), encodeVarint(value));
}

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

function buildLabel(name: string, value: string): Uint8Array {
  return concat(encodeString(1, name), encodeString(2, value));
}

function buildSample(value: number, timestampMs: number): Uint8Array {
  return concat(encodeDouble(1, value), encodeInt64(2, timestampMs));
}

function buildTimeSeries(
  labels: [string, string][],
  value: number,
  timestampMs: number,
): Uint8Array {
  const labelBytes = concat(...labels.map(([n, v]) => buildLabel(n, v)));
  const sampleBytes = buildSample(value, timestampMs);
  return concat(
    encodeField(1, 2),
    encodeVarint(labelBytes.length),
    labelBytes,
    encodeField(2, 2),
    encodeVarint(sampleBytes.length),
    sampleBytes,
  );
}

function buildRemoteWritePayload(): Uint8Array {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown';
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const now = Date.now();

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

  const tsBytes = concat(
    ...series.map((s) =>
      buildTimeSeries([...baseLabels, ['__name__', s.name]], s.value, now),
    ),
  );

  // WriteRequest wrapper (field 1 = repeated TimeSeries)
  return concat(encodeField(1, 2), encodeVarint(tsBytes.length), tsBytes);
}

async function pushMetrics(config: MetricsConfig): Promise<void> {
  const payload = buildRemoteWritePayload();
  const compressed = compressSync(payload);

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

  collectAndPush(config);

  intervalId = setInterval(() => collectAndPush(config), 60_000);
  intervalId.unref?.();

  console.log('[Metrics] Grafana Cloud push started (60s interval)');
}

export function stopMetricsCollection(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Metrics] Grafana Cloud push stopped');
  }
}
