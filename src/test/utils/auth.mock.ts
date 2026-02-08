/**  테스트 시 인증된 사용자 상태를 시뮬레이션합니다.*/
import { Request, Response, NextFunction } from 'express';
import { UserType } from '../../constants/auth.constant.js';
import type { AuthSession } from '../../types/auth.types.js';

/** Mock 사용자 인터페이스 */
export interface MockUser {
  id: string;
  email: string;
  userType: UserType;
  name: string;
  image?: string | null;
}

/** Mock 세션 인터페이스 */
export interface MockSession {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
}

/** Mock 프로필 인터페이스 (역할별로 확장 가능) */
export interface MockProfile {
  id: string;
  userId: string;
  phoneNumber: string;
  createdAt: Date;
  updatedAt: Date | null;
  [key: string]: unknown;
}

/**
 * 역할별 Mock 사용자 팩토리
 * @param userType - 사용자 역할 (INSTRUCTOR, ASSISTANT, STUDENT, PARENT)
 * @param overrides - 기본값을 덮어쓸 속성들
 */
export const createMockUser = (
  userType: UserType,
  overrides?: Partial<MockUser>,
): MockUser => ({
  id: `test-user-${userType.toLowerCase()}-${Date.now()}`,
  email: `test-${userType.toLowerCase()}@example.com`,
  userType,
  name: `Test ${userType}`,
  image: null,
  ...overrides,
});

/**
 * Mock 세션 생성
 * @param userId - 사용자 ID
 * @param overrides - 기본값을 덮어쓸 속성들
 */
export const createMockSession = (
  userId: string,
  overrides?: Partial<MockSession>,
): MockSession => ({
  id: `test-session-${Date.now()}`,
  token: `mock-session-token-${Date.now()}`,
  userId,
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7일 후
  ...overrides,
});

/**
 * Mock 프로필 생성
 * @param userId - 사용자 ID
 * @param userType - 사용자 역할
 * @param overrides - 기본값을 덮어쓸 속성들
 */
export const createMockProfile = (
  userId: string,
  userType: UserType,
  overrides?: Partial<MockProfile>,
): MockProfile => {
  const baseProfile: MockProfile = {
    id: `test-profile-${userType.toLowerCase()}-${Date.now()}`,
    userId,
    phoneNumber: '010-1234-5678',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };

  // 역할별 추가 필드
  switch (userType) {
    case UserType.INSTRUCTOR:
      return {
        ...baseProfile,
        subject: 'Math',
        academy: 'Test Academy',
      };
    case UserType.ASSISTANT:
      return {
        ...baseProfile,
        instructorId: 'test-instructor-id',
        signupCode: 'TEST-CODE',
      };
    case UserType.STUDENT:
      return {
        ...baseProfile,
        school: 'Test High School',
        schoolYear: '3',
      };
    case UserType.PARENT:
      return baseProfile;
    default:
      return baseProfile;
  }
};

/**
 * 세션 Mock 미들웨어 생성
 * Express 앱에 끼워넣어 인증된 상태를 시뮬레이션합니다.
 *
 * @param mockUser - Mock 사용자 (null이면 비로그인 상태)
 * @param mockProfile - Mock 프로필 (선택사항)
 */
export const mockAuthMiddleware = (
  mockUser: MockUser | null,
  mockProfile?: MockProfile | null,
) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (mockUser) {
      req.user = {
        id: mockUser.id,
        email: mockUser.email,
        userType: mockUser.userType,
        name: mockUser.name,
        image: mockUser.image,
      };
      req.authSession = createMockSession(
        mockUser.id,
      ) as unknown as AuthSession;
      req.profile =
        mockProfile ?? createMockProfile(mockUser.id, mockUser.userType);
    }
    next();
  };
};

/**
 * AuthService Mock 생성을 위한 getSession Mock 함수
 * DI 테스트에서 AuthService.getSession을 Mock할 때 사용합니다.
 */
export const createMockGetSession = (mockUser: MockUser | null) => {
  return jest.fn().mockResolvedValue(
    mockUser
      ? {
          user: mockUser,
          session: createMockSession(mockUser.id),
          profile: createMockProfile(mockUser.id, mockUser.userType),
        }
      : null,
  );
};

/** 강사 Mock 사용자 생성 */
export const asInstructor = (overrides?: Partial<MockUser>) =>
  createMockUser(UserType.INSTRUCTOR, overrides);

/** 조교 Mock 사용자 생성 */
export const asAssistant = (overrides?: Partial<MockUser>) =>
  createMockUser(UserType.ASSISTANT, overrides);

/** 학생 Mock 사용자 생성 */
export const asStudent = (overrides?: Partial<MockUser>) =>
  createMockUser(UserType.STUDENT, overrides);

/** 학부모 Mock 사용자 생성 */
export const asParent = (overrides?: Partial<MockUser>) =>
  createMockUser(UserType.PARENT, overrides);
