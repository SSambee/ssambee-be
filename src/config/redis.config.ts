import { Redis } from 'ioredis';
import * as Sentry from '@sentry/node';
import { config, isProduction } from './env.config.js';

export const REDIS_STATUS = {
  CONNECT: 'connect',
  ERROR: 'error',
  RECONNECT_DELAY: 5000,
};

const redisUrl =
  config.REDIS_URL ||
  (config.ENVIRONMENT === 'test' ? 'redis://localhost:6379' : '');

if (!redisUrl) {
  throw new Error('REDIS_URL이 환경 변수에 정의되지 않았습니다.');
}

export const redis = new Redis(redisUrl, {
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // 연결 끊김 시 에러를 던지지 않고 재접속 시도
  maxRetriesPerRequest: null,
  ...(config.ENVIRONMENT === 'test'
    ? {
        lazyConnect: true,
      }
    : {}),
});

redis.on(REDIS_STATUS.CONNECT, () => {
  console.log('Upstash Redis 연결 성공');
});

/** 에러시 보낼 알람 설정 */
let lastAlertTimestamp = 0;
const ALERT_COOLDOWN_MS = 60_000; // 1 분

/** 에러 발생시 Sentry로 전송 */
redis.on(REDIS_STATUS.ERROR, async (error: Error) => {
  const now = Date.now();

  if (now - lastAlertTimestamp < ALERT_COOLDOWN_MS) return;
  lastAlertTimestamp = now;

  console.error('[Redis Error]', error.message);

  if (isProduction()) {
    Sentry.captureException(error, {
      tags: { service: 'redis', source: 'redis.config' },
    });
  }
});
