/** Prisma Client를 Mock하여 DB 의존성 제거 */

// Mock 함수들
export const mockUserFindUnique = jest.fn();
export const mockUserDelete = jest.fn();
export const mockTransaction = jest.fn();

/** Mock Prisma Client 생성 */
export const createMockPrisma = () => ({
  user: {
    findUnique: mockUserFindUnique,
    update: jest.fn(),
    delete: mockUserDelete,
  },
  account: {
    findFirst: jest.fn(),
  },
  assistant: {
    findUnique: jest.fn(),
  },
  grade: {
    findMany: jest.fn(),
  },
  studentAnswer: {
    findMany: jest.fn(),
  },
  assignment: {
    count: jest.fn(),
  },
  $transaction: mockTransaction as jest.Mock,
});

/** Prisma Mock 리셋 */
export const resetPrismaMock = () => {
  mockUserFindUnique.mockReset();
  mockUserDelete.mockReset();
  mockTransaction.mockReset();
};
