/**
 * 타입 안전한 Mock 자동 생성 유틸리티
 *
 * 인터페이스의 메서드들을 자동으로 jest.fn()으로 변환합니다.
 * 수동으로 각 메서드를 나열하는 보일러플레이트를 줄여줍니다.
 *
 * @example
 * // Before (수동 방식)
 * const mock = {
 *   findById: jest.fn(),
 *   create: jest.fn(),
 *   update: jest.fn(),
 * } as unknown as jest.Mocked<MyRepository>;
 *
 * // After (자동 방식)
 * const mock = createAutoMock<MyRepository>(['findById', 'create', 'update']);
 */
export function createAutoMock<T extends object>(
  methodNames: (keyof T)[],
): jest.Mocked<T> {
  const mock = {} as jest.Mocked<T>;
  for (const name of methodNames) {
    (mock as Record<keyof T, jest.Mock>)[name] = jest.fn();
  }
  return mock;
}

/**
 * 기존 mock 객체의 모든 함수를 리셋합니다.
 *
 * @example
 * afterEach(() => {
 *   resetAllMocks(mockRepository);
 * });
 */
export function resetAllMocks<T extends object>(mock: jest.Mocked<T>): void {
  for (const key of Object.keys(mock)) {
    const value = mock[key as keyof T];
    if (typeof value === 'function' && 'mockReset' in (value as object)) {
      (value as unknown as jest.Mock).mockReset();
    }
  }
}
