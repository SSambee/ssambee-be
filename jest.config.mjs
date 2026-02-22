/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/app.ts',
    '!src/test/**/*.ts',
  ],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        // tsconfig.test.json의 내용을 SWC가 이해할 수 있게 설정
        jsc: {
          parser: {
            syntax: 'typescript',
            decorators: true, // 필요한 경우
          },
          target: 'es2022',
        },
      },
    ],
  },
  transformIgnorePatterns: [
    'node_modules/(?!(better-auth|better-call|@faker-js|@aws-sdk|better-auth/plugins|better-auth/node)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // ESM .js 확장자를 .ts로 매핑
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  verbose: true,
  // 테스트 격리
  clearMocks: true,
  restoreMocks: true,
};

export default config;
