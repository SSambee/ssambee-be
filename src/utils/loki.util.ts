import winston from 'winston';
import { isProduction } from '../config/env.config.js';

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}: ${message}${metaStr}`;
  }),
);

const logger = winston.createLogger({
  level: isProduction() ? 'info' : 'debug',
  defaultMeta: {
    service: 'ssambee-backend',
    env: process.env.NODE_ENV,
  },
  transports: [
    new winston.transports.Console({
      format: isProduction() ? winston.format.json() : consoleFormat,
    }),
  ],
});

// Loki Transport — 환경변수 있을 때만 활성화
async function initLokiTransport() {
  if (!process.env.LOKI_HOST) return;

  try {
    const { default: LokiTransport } = await import('winston-loki');

    logger.add(
      new LokiTransport({
        host: process.env.LOKI_HOST,
        basicAuth: `${process.env.LOKI_USER}:${process.env.LOKI_PASSWORD}`,
        labels: {
          app: 'ssambee-backend',
          env: process.env.NODE_ENV || 'unknown',
        },
        json: true,
        format: winston.format.combine(
          winston.format.errors({ stack: true }),
          winston.format.json(),
        ),
        replaceTimestamp: true,
        batching: false,
        onConnectionError: (err: Error) =>
          console.error('[Loki] 연결 오류:', err.message),
      }),
    );

    logger.info('Loki transport 초기화 완료', {
      host: process.env.LOKI_HOST,
    });
  } catch (err) {
    console.error('[Loki] Transport 초기화 실패:', err);
  }
}

export const lokiReady = initLokiTransport();
export default logger;
