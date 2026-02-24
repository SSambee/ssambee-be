import express from 'express';
import morgan from 'morgan';
import cors, { CorsOptions } from 'cors';
import cookieParser from 'cookie-parser';
import { router } from './routes/index.js';
import { config, isDevelopment, isProduction } from './config/env.config.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { disconnectDB } from './config/db.config.js';
import { MorganLambdaStream } from './utils/logger.util.js';
import {
  startSystemMonitoring,
  stopSystemMonitoring,
} from './utils/monitor.util.js';
import { initSentry } from './config/sentry.config.js';
import * as Sentry from '@sentry/node';
import './config/redis.config.js';

const app = express();

initSentry();

// Nginx 프록시 신뢰 설정
if (isProduction()) {
  app.set('trust proxy', 1); // 1은 1번째 프록시(Nginx)를 믿는다
}

// 1. 보안
const whiteList: string[] = config.FRONT_URL
  ? Array.from(
      new Set(
        config.FRONT_URL.split(',')
          .map((url) => url.trim())
          .filter(Boolean),
      ),
    )
  : [];

const buildContentSecurityPolicy = (origins: string[]) => {
  const connectSource = ["'self'", ...origins];

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    `connect-src ${connectSource.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
};

const securityHeaders: express.RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    buildContentSecurityPolicy(whiteList),
  );
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  if (isProduction()) {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  next();
};

const corsOptions: CorsOptions = {
  origin: isProduction() ? whiteList : true, // 프로덕션은 화이트리스트, 개발은 모두 허용(true)
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  // Sentry
  allowedHeaders: ['Content-Type', 'Authorization', 'sentry-trace', 'baggage'],
};

app.use(cors(corsOptions));

app.use(securityHeaders);

// 2. 로깅
if (isDevelopment()) {
  app.use(morgan('dev'));
}

// 비동기 Lambda 로깅 (Production 및 환경변수 설정 시 활성화)
if (config.MONITOR_LAMBDA_URL) {
  app.use(morgan('combined', { stream: new MorganLambdaStream() }));
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});
// 3. Better Auth 기본 라우트는 내부 사용만 허용하며 외부 공개를 차단한다.
app.use('/api/auth/*splat', (req, res) => {
  res.sendStatus(404);
});

// 4. 데이터 파서
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 5. 라우터
app.use('/', router);

// 6. 에러 핸들러 + Sentry 에러 핸들러
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  console.log(`🚀 Server running on http://localhost:${config.PORT}`);
  console.log(`📦 Environment: ${config.ENVIRONMENT}`);

  // 시스템 모니터링 시작 (1분 주기)
  startSystemMonitoring();
});

const gracefulShutdown = async () => {
  console.log('🛑 Received kill signal, shutting down gracefully');

  // 0. 모니터링 중지
  stopSystemMonitoring();

  // 1. 새로운 요청 거부 및 기존 요청 처리 완료 대기 (Promise로 래핑)
  const closeServer = new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) {
        console.error('❌ Error closing server:', err);
        return reject(err);
      }
      console.log('🔒 HTTP server closed');
      resolve();
    });
  });

  try {
    // 서버가 닫힐 때까지 기다림 (기존 요청 처리 완료 보장)
    await closeServer;

    // 2. 그 후 DB 연결 종료
    await disconnectDB();
    console.log('👋 Bye');

    process.exit(0);
  } catch (error) {
    console.error('💥 Error during shutdown:', error);
    process.exit(1);
  }
};

// SIGTERM: Docker, Kubernetes 등에서 컨테이너 종료 시 발생
process.on('SIGTERM', gracefulShutdown);
// SIGINT: 로컬 개발 시 Ctrl+C 누를 때 발생
process.on('SIGINT', gracefulShutdown);
