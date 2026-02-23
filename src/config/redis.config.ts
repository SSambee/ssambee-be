import { Redis } from 'ioredis';
import { config, isProduction } from './env.config.js';

export const REDIS_STATUS = {
  CONNECT: 'connect',
  ERROR: 'error',
  RECONNECT_DELAY: 5000,
};

if (!config.REDIS_URL) {
  throw new Error('REDIS_URL이 환경 변수에 정의되지 않았습니다.');
}

export const redis = new Redis(config.REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // 연결 끊김 시 에러를 던지지 않고 재접속 시도
  maxRetriesPerRequest: null,
});

redis.on(REDIS_STATUS.CONNECT, () => {
  console.log('Upstash Redis 연결 성공');
});

/** 에러시 보낼 알람 설정 */
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN_MS = 60_000; // 1 분

/** 에러 발생시 람다로 전송 */
redis.on(REDIS_STATUS.ERROR, async (error: Error) => {
  const now = Date.now();

  if (now - lastAlertTimestamp < ALERT_COOLDOWN_MS) return;
  lastAlertTimestamp = now;

  if (!isProduction()) {
    console.error('[Redis Error]', error.message);
    return;
  }

  if (!config.ALARM_LAMBDA_URL) {
    console.error('[Redis Error] 알람 URL이 설정되지 않음', error.message);
    return;
  }

  try {
    const controller = new AbortController(); // AbortController를 이용한 타임아웃 (5초)
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(config.ALARM_LAMBDA_URL!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.INTERNAL_INGEST_SECRET && {
            'x-internal-secret': config.INTERNAL_INGEST_SECRET,
          }),
        },
        signal: controller.signal,
        body: JSON.stringify({
          type: 'REDIS_ERROR',
          service: 'Upstash-Redis',
          message: error.message,
          server:
            config.ENVIRONMENT === 'production' ? 'Production' : 'Dev/Local',
          timestamp: new Date().toISOString(),
          guide:
            'Upstash 콘솔에서 사용량(30MB) 초과 여부나 네트워크를 확인하세요.',
        }),
      });

      if (!response.ok) {
        console.error(`[Redis Webhook] 전송 실패: ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (fetchError: unknown) {
    if (fetchError instanceof Error) {
      if (fetchError.name === 'AbortError') {
        console.error('[Redis Webhook] 전송 타임아웃 에러');
      } else {
        console.error('웹훅 전송 실패:', fetchError);
      }
    } else {
      console.error('[Redis Webhook] 알수 없는 에러 발생:', fetchError);
    }
  }
});
