/** 테스트용 Express 앱 생성 유틸리티 (통합 테스트용) */
import express, { Express, RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import { mockAuthMiddleware, MockUser, MockProfile } from './auth.mock.js';
import { router } from '../../routes/index.js';
import { errorHandler } from '../../middlewares/error.middleware.js';

/** 테스트용 Express 앱 옵션 */
export interface TestAppOptions {
  // Mock 사용자 (null이면 비로그인 상태)
  mockUser?: MockUser | null;
  // Mock 프로필 (선택사항)
  mockProfile?: MockProfile | null;
  // 추가 미들웨어
  middlewares?: RequestHandler[];
  // 라우터 사용 여부 (기본값: true)
  useRouter?: boolean;
}

/**
 * 테스트용 Express 앱 생성
 *
 * @param options - 테스트 앱 옵션
 * @returns Express 앱 인스턴스
 *
 * @example
 * // 비로그인 상태 테스트
 * const app = createTestApp();
 *
 * @example
 * // 강사로 로그인한 상태 테스트
 * import { asInstructor } from './auth.mock';
 * const app = createTestApp({ mockUser: asInstructor() });
 *
 * @example
 * // 특정 사용자로 테스트
 * const app = createTestApp({
 *   mockUser: {
 *     id: 'custom-id',
 *     email: 'custom@example.com',
 *     userType: UserType.INSTRUCTOR,
 *     name: 'Custom User',
 *   }
 * });
 */
export const createTestApp = (options: TestAppOptions = {}): Express => {
  const {
    mockUser = null,
    mockProfile = null,
    middlewares = [],
    useRouter = true,
  } = options;

  const app = express();

  // 기본 미들웨어
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mock 인증 미들웨어 (mockUser가 제공된 경우에만)
  if (mockUser !== undefined) {
    app.use(mockAuthMiddleware(mockUser, mockProfile));
  }

  // 추가 커스텀 미들웨어
  middlewares.forEach((middleware) => app.use(middleware));

  // 라우터
  if (useRouter) {
    app.use('/', router);
  }

  // 에러 핸들러
  app.use(errorHandler);

  return app;
};

/**
 * 미들웨어 단위 테스트용 Express 앱 생성
 * 특정 미들웨어만 테스트할 때 사용합니다.
 *
 * @param middleware - 테스트할 미들웨어
 * @param mockUser - Mock 사용자 (선택사항)
 * @returns Express 앱 인스턴스
 *
 * @example
 * import { requireAuth } from '@/middlewares/auth.middleware';
 * const app = createMiddlewareTestApp(requireAuth);
 */
export const createMiddlewareTestApp = (
  middleware: RequestHandler,
  mockUser?: MockUser | null,
): Express => {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Mock 인증 미들웨어 (mockUser가 제공된 경우)
  if (mockUser !== undefined && mockUser !== null) {
    app.use(mockAuthMiddleware(mockUser));
  }

  // 테스트할 미들웨어
  app.use(middleware);

  // 테스트용 엔드포인트
  app.get('/test', (_req, res) => {
    res.json({ success: true, user: _req.user });
  });

  app.post('/test', (_req, res) => {
    res.json({ success: true, user: _req.user });
  });

  // 에러 핸들러
  app.use(errorHandler);

  return app;
};

/**
 * 컨트롤러 단위 테스트용 Express 앱 생성
 * 특정 라우트만 테스트할 때 사용합니다.
 *
 * @param routerSetup - 라우터 설정 함수
 * @param mockUser - Mock 사용자 (선택사항)
 * @returns Express 앱 인스턴스
 *
 * @example
 * const app = createControllerTestApp((router) => {
 *   router.post('/signup', controller.instructorSignUp.bind(controller));
 * });
 */
export const createControllerTestApp = (
  routerSetup: (router: express.Router) => void,
  mockUser?: MockUser | null,
): Express => {
  const app = express();
  const testRouter = express.Router();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Mock 인증 미들웨어 (mockUser가 제공된 경우)
  if (mockUser !== undefined && mockUser !== null) {
    app.use(mockAuthMiddleware(mockUser));
  }

  // 라우터 설정
  routerSetup(testRouter);
  app.use(testRouter);

  // 에러 핸들러
  app.use(errorHandler);

  return app;
};
