import { AuthService } from './auth.service.js';
import {
  SIGNUP_PENDING_USER_TYPE,
  UserType,
} from '../constants/auth.constant.js';
import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
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
    (mockPrisma.$transaction as jest.Mock).mockImplementation(
      async (callback) => {
        return callback(mockPrisma);
      },
    );

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

  describe('[인증] signIn', () => {
    describe('AUTH-05: 로그인 성공', () => {
      it('사용자가 올바른 자격 증명으로 로그인을 요청할 때, 로그인이 성공하고 사용자 정보가 반환된다', async () => {
        // 준비
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: mockUsers.instructor.id,
          email: mockUsers.instructor.email,
          userType: UserType.INSTRUCTOR,
        });

        // Mock 응답 객체
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

        // 실행
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

    describe('AUTH-14: 가입 미완료 계정 로그인 차단', () => {
      it('이메일 OTP만 인증된 임시 계정으로 로그인을 시도할 때, UnauthorizedException을 던진다', async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: 'pending-user-id',
          email: mockUsers.student.email,
          userType: SIGNUP_PENDING_USER_TYPE,
        });

        await expect(
          authService.signIn(
            mockUsers.student.email,
            'password123',
            UserType.STUDENT,
            false,
          ),
        ).rejects.toThrow(UnauthorizedException);

        expect(mockBetterAuth.handler).not.toHaveBeenCalled();
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

      // 실행
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

      // 실행
      await expect(authService.deleteUserById(userId, headers)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('AUTH-11: 이메일 인증(OTP)', () => {
    it('인증코드 발송 요청 시 email-otp 엔드포인트를 호출한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        headers: { get: jest.fn().mockReturnValue(null) },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      await authService.requestEmailVerification(mockUsers.student.email);

      const request = (mockBetterAuth.handler as jest.Mock).mock.calls[0][0];
      expect(request.url).toContain(
        '/api/auth/email-otp/send-verification-otp',
      );
    });

    it('인증코드 검증 성공 시 유저와 쿠키를 반환한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          user: mockUsers.student,
          token: 'otp-token',
        }),
        headers: {
          get: jest.fn().mockReturnValue('session_token=test-cookie'),
        },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.verifyEmailVerification(
        mockUsers.student.email,
        '123456',
      );

      expect(result.user).toEqual(mockUsers.student);
      expect(result.session).toEqual({ token: 'otp-token' });
      expect(result.setCookie).toBe('session_token=test-cookie');
    });

    it('이메일 인증 링크 검증 시 verify-email 엔드포인트를 호출한다', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: { get: jest.fn().mockReturnValue(null) },
        json: jest.fn().mockResolvedValue({
          status: true,
          user: mockUsers.student,
        }),
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.verifyEmailWithToken('token-test');

      expect(result).toEqual(
        expect.objectContaining({
          status: true,
          user: mockUsers.student,
        }),
      );

      const request = (mockBetterAuth.handler as jest.Mock).mock.calls[0][0];
      expect(request.url).toContain('/api/auth/verify-email?token=token-test');
      expect(request.method).toBe('GET');
    });

    it('이메일 인증 링크 리다이렉트 응답도 전달한다', async () => {
      const mockResponse = {
        ok: false,
        status: 302,
        headers: {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'location') {
              return 'https://example.com/success';
            }
            return null;
          }),
        },
        json: jest.fn(),
        text: jest.fn(),
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.verifyEmailWithToken('token-test');

      expect(result.redirectTo).toBe('https://example.com/success');
      expect(result.status).toBe(true);
    });
  });

  describe('AUTH-12: 인증 세션 기반 회원가입 완료', () => {
    it('인증된 세션이 없으면 UnauthorizedException을 던진다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue(null);

      await expect(
        authService.completeSignUpWithVerifiedEmail(
          UserType.STUDENT,
          signUpRequests.student,
          {},
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('학생 가입 완료 시 비밀번호 설정/유저 업데이트 후 프로필을 생성한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: { ...mockUsers.student, userType: SIGNUP_PENDING_USER_TYPE },
        session: mockSession,
      });
      mockStudentRepo.findByPhoneNumber.mockResolvedValue(null);
      mockStudentRepo.findByUserId.mockResolvedValue(null);
      mockStudentRepo.create.mockResolvedValue(mockProfiles.student);

      mockBetterAuth.api.setPassword.mockResolvedValue({ status: true });

      const updateUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: true }),
        headers: {
          get: jest.fn().mockReturnValue('session_token=updated-cookie'),
        },
      };
      (mockBetterAuth.handler as jest.Mock).mockResolvedValueOnce(
        updateUserResponse,
      );

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.student.id,
        name: mockUsers.student.name,
        email: mockUsers.student.email,
        userType: UserType.STUDENT,
        emailVerified: true,
        image: null,
      });
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        id: mockUsers.student.id,
        name: mockUsers.student.name,
        email: mockUsers.student.email,
        userType: UserType.STUDENT,
        emailVerified: true,
        image: null,
      });

      const result = await authService.completeSignUpWithVerifiedEmail(
        UserType.STUDENT,
        {
          ...signUpRequests.student,
          email: mockUsers.student.email,
        },
        { cookie: 'session_token=otp-session' },
      );

      expect(result.user.userType).toBe(UserType.STUDENT);
      expect(result.profile).toEqual(mockProfiles.student);
      expect(result.setCookie).toBe('session_token=updated-cookie');
      expect(mockBetterAuth.api.setPassword).toHaveBeenCalledWith({
        headers: expect.anything(),
        body: {
          newPassword: signUpRequests.student.password,
        },
      });
      expect(
        mockEnrollmentsRepo.updateAppStudentIdByStudentPhoneAndParentPhone,
      ).toHaveBeenCalledWith(
        signUpRequests.student.phoneNumber,
        signUpRequests.student.parentPhoneNumber,
        mockProfiles.student.id,
        mockPrisma,
      );
      const updateUserRequest = (mockBetterAuth.handler as jest.Mock).mock
        .calls[0][0] as Request;
      expect(updateUserRequest.headers.get('origin')).toBeTruthy();
    });

    it('비밀번호가 이미 설정된 재시도 상황에서도 가입 완료가 가능하다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: { ...mockUsers.student, userType: SIGNUP_PENDING_USER_TYPE },
        session: mockSession,
      });
      mockStudentRepo.findByPhoneNumber.mockResolvedValue(null);
      mockStudentRepo.findByUserId.mockResolvedValue(null);
      mockStudentRepo.create.mockResolvedValue(mockProfiles.student);

      (mockPrisma.account.findFirst as jest.Mock).mockResolvedValue({
        id: 'credential-account-id',
        password: null,
      });

      mockBetterAuth.api.setPassword.mockRejectedValue(
        new Error('user already has a password'),
      );

      const updateUserResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: true }),
        headers: {
          get: jest.fn().mockReturnValue('session_token=updated-cookie'),
        },
      };
      (mockBetterAuth.handler as jest.Mock).mockResolvedValueOnce(
        updateUserResponse,
      );

      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.student.id,
        name: mockUsers.student.name,
        email: mockUsers.student.email,
        userType: UserType.STUDENT,
        emailVerified: true,
        image: null,
      });
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        id: mockUsers.student.id,
        name: mockUsers.student.name,
        email: mockUsers.student.email,
        userType: UserType.STUDENT,
        emailVerified: true,
        image: null,
      });

      const result = await authService.completeSignUpWithVerifiedEmail(
        UserType.STUDENT,
        {
          ...signUpRequests.student,
          email: mockUsers.student.email,
        },
        { cookie: 'session_token=otp-session' },
      );

      expect(result.user.userType).toBe(UserType.STUDENT);
      expect(result.profile).toEqual(mockProfiles.student);
      expect(mockBetterAuth.api.setPassword).toHaveBeenCalledWith({
        headers: expect.anything(),
        body: {
          newPassword: signUpRequests.student.password,
        },
      });
      expect(
        mockEnrollmentsRepo.updateAppStudentIdByStudentPhoneAndParentPhone,
      ).toHaveBeenCalledWith(
        signUpRequests.student.phoneNumber,
        signUpRequests.student.parentPhoneNumber,
        mockProfiles.student.id,
        mockPrisma,
      );
      const handlerRequests = (mockBetterAuth.handler as jest.Mock).mock.calls
        .map(([request]) => request as { url: string })
        .map((request) => request.url);
      expect(handlerRequests).toEqual([
        expect.stringContaining('/api/auth/update-user'),
      ]);
    });
  });

  describe('AUTH-13: 이메일/비밀번호 관리', () => {
    it('내 이메일 변경 요청 시 change-email 엔드포인트를 호출한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ status: true }),
        headers: { get: jest.fn().mockReturnValue(null) },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.changeMyEmail(
        { cookie: 'session_token=test' },
        'new@example.com',
      );

      expect(result).toEqual({ status: true });

      const request = mockBetterAuth.handler.mock.calls[0][0];
      const requestBody = await (request as Request).clone().json();

      expect(request.url).toContain('/api/auth/change-email');
      expect(requestBody).toEqual(
        expect.objectContaining({
          newEmail: 'new@example.com',
        }),
      );
    });

    it('내 비밀번호 변경 성공 시 Set-Cookie를 함께 반환한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          token: null,
          user: mockUsers.student,
        }),
        headers: { get: jest.fn().mockReturnValue('session_token=new-cookie') },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.changeMyPassword(
        { cookie: 'session_token=test' },
        'password123!',
        'newPassword123!',
        true,
      );

      expect(result.setCookie).toBe('session_token=new-cookie');
    });

    it('비밀번호 찾기 요청 시 forget-password OTP 엔드포인트를 호출한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        headers: { get: jest.fn().mockReturnValue(null) },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.findPassword(mockUsers.student.email);

      expect(result.success).toBe(true);

      const request = mockBetterAuth.handler.mock.calls[0][0];
      const requestBody = await (request as Request).clone().json();

      expect(request.url).toContain(
        '/api/auth/email-otp/send-verification-otp',
      );
      expect(requestBody).toEqual(
        expect.objectContaining({
          email: mockUsers.student.email,
          type: 'forget-password',
        }),
      );
    });

    it('비밀번호 재설정 시 email-otp/reset-password 엔드포인트를 호출한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        headers: { get: jest.fn().mockReturnValue(null) },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.resetPasswordWithOTP(
        mockUsers.student.email,
        '123456',
        'newPassword123!',
      );

      expect(result.success).toBe(true);

      const request = mockBetterAuth.handler.mock.calls[0][0];
      const requestBody = await (request as Request).clone().json();

      expect(request.url).toContain('/api/auth/email-otp/reset-password');
      expect(requestBody).toEqual(
        expect.objectContaining({
          email: mockUsers.student.email,
          otp: '123456',
          password: 'newPassword123!',
        }),
      );
    });
  });
});
