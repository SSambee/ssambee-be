import { Redis } from 'ioredis';

export const REDIS_STATUS = {
  CONNECT: 'connect',
  ERROR: 'error',
  RECONNECT_DELAY: 5000,
};

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL이 환경 변수에 정의되지 않았습니다.');
}

// singleton
export const redis = new Redis(process.env.REDIS_URL, {
  // 연결 실패 시 재시도 전략
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  // 연결 끊김 시 에러를 던지지 않고 재접속 시도
  maxRetriesPerRequest: null,
});

// 연결 성공 시
redis.on(REDIS_STATUS.CONNECT, () => {
  console.log('Upstash Redis 연결 성공');
});

// 에러 발생시 sentry로 전송
redis.on(REDIS_STATUS.ERROR, async (error: Error) => {
  try {
    await fetch(process.env.ALARM_LAMBDA_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'REDIS_ERROR',
        service: 'Upstash-Redis',
        message: error.message,
        server:
          process.env.NODE_ENV === 'production' ? 'Production' : 'Dev/Local',
        timestamp: new Date().toISOString(),
        guide:
          'Upstash 콘솔에서 사용량(30MB)을 초과했는지, 혹은 네트워크 설정이 변경되었는지 확인하세요.',
      }),
    });
  } catch (fetchError) {
    console.error('웹훅 전송 실패:', fetchError);
  }
});
