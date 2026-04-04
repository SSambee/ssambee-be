import dotenv from 'dotenv';
dotenv.config();

// 테스트 환경 변수 설정
process.env.NODE_ENV = 'test';
process.env.ENVIRONMENT = 'test';

// 필수 환경 변수 Mocking (Zod 검증 통과용)
// .env에 TEST_DATABASE_URL이 있으면 그것을 최우선으로 사용함
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';
process.env.PORT = process.env.PORT || '3000';
process.env.FRONT_URL = 'http://localhost:3000';
process.env.BETTER_AUTH_SECRET = 'a'.repeat(32);
process.env.BETTER_AUTH_URL = 'http://localhost:3001';
process.env.SENTRY_DSN = 'https://sentry.io/test';

// AWS Mocking
process.env.AWS_REGION = 'ap-northeast-2';
process.env.AWS_S3_BUCKET_DOCUMENTS = 'test-bucket-docs';
process.env.AWS_S3_BUCKET_REPORTS = 'test-bucket-reports';
process.env.AWS_CLOUDFRONT_URL_DOCUMENTS = 'docs.cloudfront.net';
process.env.AWS_CLOUDFRONT_URL_REPORTS = 'reports.cloudfront.net';

// better-auth 모킹 (ESM 모듈 호환성 문제 해결)
jest.mock('better-auth', () => ({
  betterAuth: jest.fn(() => ({
    handler: jest.fn(),
    api: {
      getSession: jest.fn(),
      setPassword: jest.fn(),
      signOut: jest.fn(),
      deleteUser: jest.fn(),
      removeUser: jest.fn(),
    },
  })),
}));

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn((headers) => headers),
  toNodeHandler: jest.fn(() => jest.fn()),
}));

jest.mock('better-auth/adapters/prisma', () => ({
  prismaAdapter: jest.fn(),
}));

/** 테스트 타임아웃 설정 (10초) */
jest.setTimeout(10000);

/** 모든 테스트 시작 전 실행되는 전역 설정 */
beforeAll(async () => {});

/** 모든 테스트 종료 후 실행되는 전역 정리 작업 */
afterAll(async () => {});
