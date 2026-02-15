import { AuthService } from './auth.service.js';
import { UserType } from '../constants/auth.constant.js';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import {
  createMockInstructorRepository,
  createMockStudentRepository,
  createMockAssistantRepository,
  createMockParentRepository,
  createMockAssistantCodeRepository,
  createMockEnrollmentsRepository,
  createMockBetterAuth,
  createMockPrisma,
} from '../test/mocks/index.js';
import {
  mockUsers,
  mockSession,
  signUpRequests,
  mockProfiles,
  mockAssistantCode,
} from '../test/fixtures/index.js';
import { PrismaClient } from '../generated/prisma/client.js';
import type { auth } from '../config/auth.config.js';

describe('AuthService - @unit #critical', () => {
  // Mock Dependencies
  let mockInstructorRepo: ReturnType<typeof createMockInstructorRepository>;
  let mockAssistantRepo: ReturnType<typeof createMockAssistantRepository>;
  let mockAssistantCodeRepo: ReturnType<
    typeof createMockAssistantCodeRepository
  >;
  let mockStudentRepo: ReturnType<typeof createMockStudentRepository>;
  let mockParentRepo: ReturnType<typeof createMockParentRepository>;
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockBetterAuth: ReturnType<typeof createMockBetterAuth>;
  let mockPrisma: PrismaClient;

  // Service under test
  let authService: AuthService;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock dependencies
    mockInstructorRepo = createMockInstructorRepository();
    mockAssistantRepo = createMockAssistantRepository();
    mockAssistantCodeRepo = createMockAssistantCodeRepository();
    mockStudentRepo = createMockStudentRepository();
    mockParentRepo = createMockParentRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockBetterAuth = createMockBetterAuth();
    mockPrisma = createMockPrisma() as unknown as PrismaClient;

    // Create AuthService DI (모든 의존성 주입)
    authService = new AuthService(
      mockInstructorRepo,
      mockAssistantRepo,
      mockAssistantCodeRepo,
      mockStudentRepo,
      mockParentRepo,
      mockEnrollmentsRepo,
      mockBetterAuth as unknown as typeof auth,
      mockPrisma,
    );
  });

  // ============================================
  // [인증 (Login)] 테스트 케이스
  // ============================================

  describe('[인증] signUp', () => {
    describe('AUTH-01: 강사 회원가입', () => {
      it('강사가 올바른 정보로 회원가입을 요청할 때, 회원가입이 성공적으로 완료되고 유저 정보가 반환된다', async () => {
        // 준비
        mockInstructorRepo.findByPhoneNumber.mockResolvedValue(null);
        mockInstructorRepo.create.mockResolvedValue(mockProfiles.instructor);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.instructor,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행
        const result = await authService.signUp(
          UserType.INSTRUCTOR,
          signUpRequests.instructor,
        );

        // 검증
        expect(result.user).toEqual(mockUsers.instructor);
        expect(result.session).toEqual(mockSession);
        expect(mockInstructorRepo.findByPhoneNumber).toHaveBeenCalledWith(
          signUpRequests.instructor.phoneNumber,
        );
      });

      it('강사가 이미 가입된 전화번호로 회원가입을 요청할 때, BadRequestException을 던진다', async () => {
        // 준비
        mockInstructorRepo.findByPhoneNumber.mockResolvedValue(
          mockProfiles.instructor,
        );

        // 실행 & Assert
        await expect(
          authService.signUp(UserType.INSTRUCTOR, signUpRequests.instructor),
        ).rejects.toThrow(BadRequestException);
        await expect(
          authService.signUp(UserType.INSTRUCTOR, signUpRequests.instructor),
        ).rejects.toThrow('이미 가입된 전화번호입니다.');
      });
    });

    describe('AUTH-02: 조교 회원가입 (조교 코드 검증)', () => {
      it('조교가 유효한 조교 코드로 회원가입을 요청할 때, 회원가입이 성공적으로 완료된다', async () => {
        // 준비
        mockAssistantRepo.findByPhoneNumber.mockResolvedValue(null);
        mockAssistantCodeRepo.findValidCode.mockResolvedValue(
          mockAssistantCode,
        );
        mockAssistantCodeRepo.markAsUsed.mockResolvedValue(mockAssistantCode);
        mockAssistantRepo.create.mockResolvedValue(mockProfiles.assistant);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.assistant,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn) =>
          fn({}),
        );

        // 실행
        const result = await authService.signUp(
          UserType.ASSISTANT,
          signUpRequests.assistant,
        );

        // 검증
        expect(result.user.userType).toBe(UserType.ASSISTANT);
        expect(mockAssistantCodeRepo.findValidCode).toHaveBeenCalledWith(
          signUpRequests.assistant.signupCode,
        );
        // Verify name is saved to Assistant table
        expect(mockAssistantRepo.create).toHaveBeenCalledWith(
          expect.objectContaining({
            name: signUpRequests.assistant.name,
          }),
          expect.anything(), // Transaction client
        );
      });

      it('조교가 조교 코드 없이 회원가입을 요청할 때, BadRequestException을 던진다', async () => {
        // 준비
        const dataWithoutCode = {
          ...signUpRequests.assistant,
          signupCode: undefined,
        };
        mockAssistantRepo.findByPhoneNumber.mockResolvedValue(null);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.assistant,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행 & Assert
        await expect(
          authService.signUp(UserType.ASSISTANT, dataWithoutCode),
        ).rejects.toThrow(BadRequestException);
      });

      it('조교가 유효하지 않은 조교 코드로 회원가입을 요청할 때, BadRequestException을 던진다', async () => {
        // 준비
        mockAssistantRepo.findByPhoneNumber.mockResolvedValue(null);
        mockAssistantCodeRepo.findValidCode.mockResolvedValue(null);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.assistant,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행 & Assert
        await expect(
          authService.signUp(UserType.ASSISTANT, signUpRequests.assistant),
        ).rejects.toThrow(BadRequestException);
        await expect(
          authService.signUp(UserType.ASSISTANT, signUpRequests.assistant),
        ).rejects.toThrow('유효하지 않거나 만료된 조교가입코드입니다.');
      });
    });

    describe('AUTH-03: 학생 회원가입', () => {
      it('학생이 올바른 정보로 회원가입을 요청할 때, 회원가입이 성공적으로 완료된다', async () => {
        // 준비
        mockStudentRepo.findByPhoneNumber.mockResolvedValue(null);
        mockStudentRepo.create.mockResolvedValue(mockProfiles.student);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.student,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행
        const result = await authService.signUp(
          UserType.STUDENT,
          signUpRequests.student,
        );

        // 검증
        expect(result.user.userType).toBe(UserType.STUDENT);
        expect(mockStudentRepo.create).toHaveBeenCalled();
        expect(
          mockEnrollmentsRepo.updateAppStudentIdByPhoneNumber,
        ).toHaveBeenCalledWith(
          signUpRequests.student.phoneNumber,
          mockProfiles.student.id,
        );
      });
    });

    describe('AUTH-04: 학부모 회원가입', () => {
      it('학부모가 올바른 정보로 회원가입을 요청할 때, 회원가입이 성공적으로 완료된다', async () => {
        // 준비
        mockParentRepo.findByPhoneNumber.mockResolvedValue(null);
        mockParentRepo.create.mockResolvedValue(mockProfiles.parent);

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.parent,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행
        const result = await authService.signUp(
          UserType.PARENT,
          signUpRequests.parent,
        );

        // 검증
        expect(result.user.userType).toBe(UserType.PARENT);
        expect(mockParentRepo.create).toHaveBeenCalled();
      });
    });
  });

  describe('[인증] signIn', () => {
    describe('AUTH-05: 로그인 성공', () => {
      it('사용자가 올바른 자격 증명으로 로그인을 요청할 때, 로그인이 성공하고 사용자 정보가 반환된다', async () => {
        // 준비
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: mockUsers.instructor.id,
          email: mockUsers.instructor.email,
          userType: UserType.INSTRUCTOR,
        });

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.instructor,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        mockInstructorRepo.findByUserId.mockResolvedValue(
          mockProfiles.instructor,
        );

        // 실행
        const result = await authService.signIn(
          mockUsers.instructor.email,
          'password123',
          UserType.INSTRUCTOR,
          false,
        );

        // 검증
        expect(result.user).toEqual(mockUsers.instructor);
        expect(result.session).toEqual(mockSession);
        expect(result.profile).toEqual(mockProfiles.instructor);
      });
    });

    describe('AUTH-08: userType 불일치 로그인', () => {
      it('사용자가 가입된 역할과 다른 역할로 로그인을 시도할 때, ForbiddenException을 던진다', async () => {
        // 준비 - 강사로 가입된 유저가 학생으로 로그인 시도
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: mockUsers.instructor.id,
          email: mockUsers.instructor.email,
          userType: UserType.INSTRUCTOR,
        });

        // 실행 & Assert
        await expect(
          authService.signIn(
            mockUsers.instructor.email,
            'password123',
            UserType.STUDENT,
            false,
          ),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          authService.signIn(
            mockUsers.instructor.email,
            'password123',
            UserType.STUDENT,
            false,
          ),
        ).rejects.toThrow('유저 역할이 잘못되었습니다.');
      });
    });
  });

  describe('[인증] getSession', () => {
    describe('AUTH-07: 세션 조회', () => {
      it('사용자가 유효한 세션으로 조회를 요청할 때, 사용자 및 프로필 정보가 반환된다', async () => {
        // 준비
        const headers = { cookie: 'session_token=test-token' };

        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
        });

        mockInstructorRepo.findByUserId.mockResolvedValue(
          mockProfiles.instructor,
        );

        // 실행
        const result = await authService.getSession(headers);

        // 검증
        expect(result).not.toBeNull();
        expect(result?.user).toEqual(mockUsers.instructor);
        expect(result?.profile).toEqual(mockProfiles.instructor);
      });

      it('사용자가 유효하지 않은 세션으로 조회를 요청할 때, null이 반환된다', async () => {
        // 준비
        const headers = {};
        mockBetterAuth.api.getSession.mockResolvedValue(null);

        // 실행
        const result = await authService.getSession(headers);

        // 검증
        expect(result).toBeNull();
      });
    });
  });

  describe('[인증] signOut', () => {
    describe('AUTH-06: 로그아웃', () => {
      it('사용자가 로그아웃을 요청할 때, better-auth API가 호출되고 세션이 종료된다', async () => {
        // 준비
        const headers = { cookie: 'session_token=test-token' };
        mockBetterAuth.api.signOut.mockResolvedValue({ success: true });

        // 실행
        await authService.signOut(headers);

        // 검증
        expect(mockBetterAuth.api.signOut).toHaveBeenCalledWith({
          headers: headers,
        });
      });
    });
  });

  /**  [권한 (RBAC)] 테스트 케이스 - Service Layer */
  describe('[권한] 역할별 프로필 조회', () => {
    describe('RBAC-U01: 강사 프로필 조회', () => {
      it('강사가 세션 조회를 요청할 때, 강사 프로필 정보가 포함되어 반환된다', async () => {
        // 준비
        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
        });
        mockInstructorRepo.findByUserId.mockResolvedValue(
          mockProfiles.instructor,
        );

        // 실행
        const result = await authService.getSession({});

        // 검증
        expect(mockInstructorRepo.findByUserId).toHaveBeenCalledWith(
          mockUsers.instructor.id,
        );
        expect(result?.profile).toEqual(mockProfiles.instructor);
      });
    });

    describe('RBAC-U02: 조교 프로필 조회', () => {
      it('조교가 세션 조회를 요청할 때, 조교 프로필 정보가 포함되어 반환된다', async () => {
        // 준비
        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.assistant,
          session: mockSession,
        });
        mockAssistantRepo.findByUserId.mockResolvedValue(
          mockProfiles.assistant,
        );

        // 실행
        const result = await authService.getSession({});

        // 검증
        expect(mockAssistantRepo.findByUserId).toHaveBeenCalledWith(
          mockUsers.assistant.id,
        );
        expect(result?.profile).toEqual(mockProfiles.assistant);
      });
    });

    describe('RBAC-U03: 학생/학부모 프로필 분리 조회', () => {
      it('학생이 세션 조회를 요청할 때, 학생 프로필 정보가 포함되어 반환된다', async () => {
        // 준비
        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.student,
          session: mockSession,
        });
        mockStudentRepo.findByUserId.mockResolvedValue(mockProfiles.student);

        // 실행
        const result = await authService.getSession({});

        // 검증
        expect(mockStudentRepo.findByUserId).toHaveBeenCalledWith(
          mockUsers.student.id,
        );
        expect(result?.profile).toEqual(mockProfiles.student);
      });

      it('학부모가 세션 조회를 요청할 때, 학부모 프로필 정보가 포함되어 반환된다', async () => {
        // 준비
        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.parent,
          session: mockSession,
        });
        mockParentRepo.findByUserId.mockResolvedValue(mockProfiles.parent);

        // 실행
        const result = await authService.getSession({});

        // 검증
        expect(mockParentRepo.findByUserId).toHaveBeenCalledWith(
          mockUsers.parent.id,
        );
        expect(result?.profile).toEqual(mockProfiles.parent);
      });
    });
  });

  /**  [예외 케이스] 테스트 */
  describe('[예외] 에러 핸들링', () => {
    describe('ERR-01: 프로필 생성 실패 시 롤백', () => {
      it('회원가입 중 프로필 생성에 실패할 때, 생성된 유저 정보가 롤백(삭제)된다', async () => {
        // 준비
        mockInstructorRepo.findByPhoneNumber.mockResolvedValue(null);
        mockInstructorRepo.create.mockRejectedValue(
          new Error('Profile creation failed'),
        );

        // Mock 응답 객체 객체
        const mockResponse = {
          ok: true,
          json: jest.fn().mockResolvedValue({
            user: mockUsers.instructor,
            session: mockSession,
          }),
          headers: {
            get: jest.fn().mockReturnValue('session_token=test-cookie'),
          },
        };
        mockBetterAuth.handler.mockResolvedValue(mockResponse);

        // 실행 & Assert
        await expect(
          authService.signUp(UserType.INSTRUCTOR, signUpRequests.instructor),
        ).rejects.toThrow('Profile creation failed');

        // 롤백 확인
        expect(mockPrisma.user.delete).toHaveBeenCalledWith({
          where: { id: mockUsers.instructor.id },
        });
      });
    });
  });

  describe('AUTH-09: 회원 탈퇴', () => {
    it('사용자가 회원 탈퇴를 요청할 때, Better Auth의 deleteUser API가 호출된다', async () => {
      // 준비
      const headers = { cookie: 'test-session-cookie' };
      mockBetterAuth.api.deleteUser.mockResolvedValue({
        success: true,
      });

      // 실행
      await authService.withdraw(headers);

      // 검증
      expect(mockBetterAuth.api.deleteUser).toHaveBeenCalledWith({
        headers: expect.anything(),
        body: {},
      });
    });
  });

  describe('AUTH-10: 관리자 회원 탈퇴 처리', () => {
    const userId = 'user-123';
    const headers = { authorization: 'Bearer token' };

    it('관리자가 회원 탈퇴를 요청할 때, Better Auth의 removeUser API가 호출된다', async () => {
      // 준비
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        userType: UserType.ASSISTANT,
      });
      (mockBetterAuth.api.removeUser as jest.Mock).mockResolvedValue({
        success: true,
      });

      // 실행
      await authService.deleteUserById(userId, headers);

      // 검증
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: { id: true, userType: true },
      });
      expect(mockBetterAuth.api.removeUser).toHaveBeenCalledWith({
        body: { userId },
        headers: expect.anything(),
      });
    });

    it('존재하지 않는 사용자일 경우 NotFoundException을 던진다', async () => {
      // 준비
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      // 실행 & Assert
      await expect(authService.deleteUserById(userId, headers)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('조교가 아닌 사용자를 삭제하려 하면 ForbiddenException을 던진다', async () => {
      // 준비
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: userId,
        userType: UserType.STUDENT,
      });

      // 실행 & Assert
      await expect(authService.deleteUserById(userId, headers)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
