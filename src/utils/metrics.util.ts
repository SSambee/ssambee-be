import os from 'node:os';

interface MetricsConfig {
  url: string;
  username: string;
  apiKey: string;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

function buildPrometheusMetrics(): string {
  const mem = process.memoryUsage();
  const cpus = os.cpus();
  const now = Math.floor(Date.now() / 1000);

  const totalTick = { idle: 0, total: 0 };
  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times) as (keyof typeof cpu.times)[]) {
      totalTick.total += cpu.times[type];
    }
    totalTick.idle += cpu.times.idle;
  }
  const cpuIdle = totalTick.idle / cpus.length;
  const cpuTotal = totalTick.total / cpus.length;
  const cpuUsagePercent = ((cpuTotal - cpuIdle) / cpuTotal) * 100;

  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'unknown';

  const lines: string[] = [
    `app_memory_rss_bytes{env="${env}"} ${mem.rss} ${now}`,
    `app_memory_heap_used_bytes{env="${env}"} ${mem.heapUsed} ${now}`,
    `app_memory_heap_total_bytes{env="${env}"} ${mem.heapTotal} ${now}`,
    `system_memory_free_bytes{env="${env}"} ${os.freemem()} ${now}`,
    `system_memory_total_bytes{env="${env}"} ${os.totalmem()} ${now}`,
    `system_memory_used_bytes{env="${env}"} ${os.totalmem() - os.freemem()} ${now}`,
    `system_cpu_usage_percent{env="${env}"} ${cpuUsagePercent.toFixed(2)} ${now}`,
    `system_cpu_count{env="${env}"} ${cpus.length} ${now}`,
    `process_uptime_seconds{env="${env}"} ${Math.floor(process.uptime())} ${now}`,
    `node_active_handles{env="${env}"} ${(process as unknown as { _getActiveHandles(): unknown[] })._getActiveHandles().length} ${now}`,
  ];

  return lines.join('\n') + '\n';
}

// Grafana Cloud /api/prom/push (Prometheus text format)
async function pushMetrics(config: MetricsConfig): Promise<void> {
  const body = buildPrometheusMetrics();

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      Authorization:
        'Basic ' +
        Buffer.from(`${config.username}:${config.apiKey}`).toString('base64'),
    },
    body,
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

  // 초기 1회 전송
  collectAndPush(config);

  intervalId = setInterval(() => collectAndPush(config), 60_000);
  intervalId.unref?.(); // 프로세스 종료 차단 방지

  console.log('[Metrics] Grafana Cloud push started (60s interval)');
}

export function stopMetricsCollection(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Metrics] Grafana Cloud push stopped');
  }
}
