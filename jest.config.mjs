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
    // TypeScript 및 JavaScript 파일 변환 (.ts, .js, .mjs, .cjs)
    '^.+\\.(t|j)sx?$': [
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
    // ESM .mjs 파일 변환
    '^.+\\.mjs$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            syntax: 'ecmascript',
            modules: true,
          },
          target: 'es2022',
        },
      },
    ],
  },
  // pnpm의 .pnpm 디렉토리 내 better-auth 관련 ESM 패키지 변환
  // 빈 배열 = 모든 node_modules 파일을 transform (ESM 호환성 위해)
  transformIgnorePatterns: [],
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
