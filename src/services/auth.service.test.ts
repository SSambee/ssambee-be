import { AuthService } from './auth.service.js';
import {
  AdminProfileStatus,
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
  createMockAdminRepository,
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
import type { BillingService } from './billing.service.js';

describe('AuthService - @unit #critical', () => {
  // Mock Dependencies
  let mockInstructorRepo: ReturnType<typeof createMockInstructorRepository>;
  let mockAssistantRepo: ReturnType<typeof createMockAssistantRepository>;
  let mockAssistantCodeRepo: ReturnType<
    typeof createMockAssistantCodeRepository
  >;
  let mockStudentRepo: ReturnType<typeof createMockStudentRepository>;
  let mockParentRepo: ReturnType<typeof createMockParentRepository>;
  let mockAdminRepo: ReturnType<typeof createMockAdminRepository>;
  let mockEnrollmentsRepo: ReturnType<typeof createMockEnrollmentsRepository>;
  let mockBetterAuth: ReturnType<typeof createMockBetterAuth>;
  let mockBillingService: jest.Mocked<
    Pick<
      BillingService,
      'getInstructorBillingSummary' | 'getSessionActiveEntitlement'
    >
  >;
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
    mockAdminRepo = createMockAdminRepository();
    mockEnrollmentsRepo = createMockEnrollmentsRepository();
    mockBetterAuth = createMockBetterAuth();
    mockBillingService = {
      getInstructorBillingSummary: jest.fn(),
      getSessionActiveEntitlement: jest.fn(),
    };
    mockBillingService.getInstructorBillingSummary.mockResolvedValue({
      activeEntitlement: null,
      creditSummary: {
        totalAvailable: 0,
      },
    });
    mockBillingService.getSessionActiveEntitlement.mockResolvedValue(null);
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
      mockAdminRepo,
      mockEnrollmentsRepo,
      mockBetterAuth as unknown as typeof auth,
      mockBillingService as unknown as BillingService,
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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

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
        expect(
          mockBillingService.getInstructorBillingSummary,
        ).not.toHaveBeenCalled();
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

      it('활성화되지 않은 관리자 계정은 로그인할 수 없다', async () => {
        (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
          id: mockUsers.admin.id,
          email: mockUsers.admin.email,
          userType: UserType.ADMIN,
        });
        mockAdminRepo.findByUserId.mockResolvedValue({
          id: 'admin-profile-id',
          userId: mockUsers.admin.id,
          status: AdminProfileStatus.PENDING_ACTIVATION,
          isPrimaryAdmin: true,
          invitedByUserId: null,
          invitedAt: new Date(),
          activatedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        await expect(
          authService.signIn(
            mockUsers.admin.email,
            'password123',
            UserType.ADMIN,
            false,
          ),
        ).rejects.toThrow(ForbiddenException);

        await expect(
          authService.signIn(
            mockUsers.admin.email,
            'password123',
            UserType.ADMIN,
            false,
          ),
        ).rejects.toThrow('관리자 최초 활성화가 필요합니다.');
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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

        // 실행
        const result = await authService.getSession(headers);

        // 검증
        expect(result).not.toBeNull();
        expect(result?.user).toEqual(mockUsers.instructor);
        expect(result?.profile).toEqual(mockProfiles.instructor);
        expect(
          mockBillingService.getSessionActiveEntitlement,
        ).not.toHaveBeenCalled();
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

      it('강사 세션 조회 시 billing summary를 자동으로 포함하지 않아야 한다', async () => {
        mockBetterAuth.api.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
        });
        mockInstructorRepo.findByUserId.mockResolvedValue(
          mockProfiles.instructor,
        );

        const result = await authService.getSession({
          cookie: 'session_token=test-token',
        });

        expect(result?.profile).toEqual(mockProfiles.instructor);
        expect(
          mockBillingService.getSessionActiveEntitlement,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('[인증] getSessionWithInstructorBillingSummary', () => {
    it('강사 세션 조회 시 활성 이용권 요약을 profile에 추가해야 한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.instructor,
        session: mockSession,
      });
      mockInstructorRepo.findByUserId.mockResolvedValue(
        mockProfiles.instructor,
      );
      mockAdminRepo.findByUserId.mockResolvedValue(null);
      mockBillingService.getSessionActiveEntitlement.mockResolvedValue({
        id: 'entitlement-1',
        status: 'ACTIVE',
        startsAt: new Date('2026-03-24T00:00:00.000Z'),
        endsAt: new Date('2026-04-23T14:59:59.999Z'),
        includedCreditAmount: 1000,
      });

      const result = await authService.getSessionWithInstructorBillingSummary({
        cookie: 'session_token=test-token',
      });

      expect(result?.profile).toEqual({
        ...mockProfiles.instructor,
        activeEntitlement: {
          id: 'entitlement-1',
          status: 'ACTIVE',
          startsAt: new Date('2026-03-24T00:00:00.000Z'),
          endsAt: new Date('2026-04-23T14:59:59.999Z'),
          includedCreditAmount: 1000,
        },
      });
      expect(
        mockBillingService.getSessionActiveEntitlement,
      ).toHaveBeenCalledWith(mockProfiles.instructor.id);
    });

    it('강사 세션 조회 시 활성 이용권이 없으면 null을 포함해야 한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.instructor,
        session: mockSession,
      });
      mockInstructorRepo.findByUserId.mockResolvedValue(
        mockProfiles.instructor,
      );
      mockAdminRepo.findByUserId.mockResolvedValue(null);
      mockBillingService.getSessionActiveEntitlement.mockResolvedValue(null);

      const result = await authService.getSessionWithInstructorBillingSummary({
        cookie: 'session_token=test-token',
      });

      expect(result?.profile).toEqual({
        ...mockProfiles.instructor,
        activeEntitlement: null,
      });
    });

    it('강사 세션 조회 시 활성 이용권이 없고 pending 이용권 결제가 있으면 marker를 추가해야 한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.instructor,
        session: mockSession,
      });
      mockInstructorRepo.findByUserId.mockResolvedValue(
        mockProfiles.instructor,
      );
      mockAdminRepo.findByUserId.mockResolvedValue(null);
      mockBillingService.getSessionActiveEntitlement.mockResolvedValue({
        status: 'PENDING_DEPOSIT',
        paymentId: 'payment-pending-1',
        requestedAt: new Date('2026-04-16T04:00:00.000Z'),
        productName: '1개월 이용권',
      });

      const result = await authService.getSessionWithInstructorBillingSummary({
        cookie: 'session_token=test-token',
      });

      expect(result?.profile).toEqual({
        ...mockProfiles.instructor,
        activeEntitlement: {
          status: 'PENDING_DEPOSIT',
          paymentId: 'payment-pending-1',
          requestedAt: new Date('2026-04-16T04:00:00.000Z'),
          productName: '1개월 이용권',
        },
      });
    });

    it('조교 세션 조회 시 담당 강사의 활성 이용권 요약을 profile에 추가해야 한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.assistant,
        session: mockSession,
      });
      mockAssistantRepo.findByUserId.mockResolvedValue(mockProfiles.assistant);
      mockAdminRepo.findByUserId.mockResolvedValue(null);
      mockBillingService.getSessionActiveEntitlement.mockResolvedValue({
        id: 'entitlement-2',
        status: 'ACTIVE',
        startsAt: new Date('2026-03-25T00:00:00.000Z'),
        endsAt: new Date('2026-04-24T14:59:59.999Z'),
        includedCreditAmount: 1200,
      });

      const result = await authService.getSessionWithInstructorBillingSummary(
        {},
      );

      expect(result?.profile).toEqual({
        ...mockProfiles.assistant,
        activeEntitlement: {
          id: 'entitlement-2',
          status: 'ACTIVE',
          startsAt: new Date('2026-03-25T00:00:00.000Z'),
          endsAt: new Date('2026-04-24T14:59:59.999Z'),
          includedCreditAmount: 1200,
        },
      });
      expect(
        mockBillingService.getSessionActiveEntitlement,
      ).toHaveBeenCalledWith(mockProfiles.assistant.instructorId);
    });

    it('학생 세션 조회 시 billing summary를 조회하지 않아야 한다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.student,
        session: mockSession,
      });
      mockStudentRepo.findByUserId.mockResolvedValue(mockProfiles.student);
      mockAdminRepo.findByUserId.mockResolvedValue(null);

      const result = await authService.getSessionWithInstructorBillingSummary(
        {},
      );

      expect(result?.profile).toEqual(mockProfiles.student);
      expect(
        mockBillingService.getSessionActiveEntitlement,
      ).not.toHaveBeenCalled();
    });
  });

  describe('[인증] getAdminSession', () => {
    it('primary admin 세션 조회 시 canInviteAdmins=true를 포함해야 한다', async () => {
      jest.spyOn(authService, 'getSession').mockResolvedValue({
        user: mockUsers.admin,
        session: mockSession,
        profile: null,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.ACTIVE,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authService.getAdminSession({
        cookie: 'session_token=test-token',
      });

      expect(result).toEqual(
        expect.objectContaining({
          user: mockUsers.admin,
          profile: null,
          canInviteAdmins: true,
        }),
      );
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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

        // 실행
        const result = await authService.getSession({});

        // 검증
        expect(mockInstructorRepo.findByUserId).toHaveBeenCalledWith(
          mockUsers.instructor.id,
        );
        expect(result?.profile).toEqual(mockProfiles.instructor);
        expect(
          mockBillingService.getInstructorBillingSummary,
        ).not.toHaveBeenCalled();
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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

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
        mockAdminRepo.findByUserId.mockResolvedValue(null);

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

    it('인증코드 검증 성공 시 다중 Set-Cookie를 모두 반환한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          user: mockUsers.student,
          token: 'otp-token',
        }),
        headers: {
          getSetCookie: jest
            .fn()
            .mockReturnValue([
              'ssambee-auth.session_token=test-cookie; Path=/; HttpOnly',
              'ssambee-auth.session_data=test-data; Path=/; HttpOnly',
            ]),
          get: jest.fn().mockReturnValue(null),
        },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.verifyEmailVerification(
        mockUsers.student.email,
        '123456',
      );

      expect(result.setCookie).toEqual([
        'ssambee-auth.session_token=test-cookie; Path=/; HttpOnly',
        'ssambee-auth.session_data=test-data; Path=/; HttpOnly',
      ]);
    });

    it('관리자 활성화용 OTP 요청은 pending admin에게만 발송한다', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.admin.id,
        userType: UserType.ADMIN,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockBetterAuth.handler.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({ success: true }),
        headers: { get: jest.fn().mockReturnValue(null) },
      });

      const result = await authService.requestAdminActivationOtp(
        mockUsers.admin.email,
      );

      expect(result).toEqual({ status: true });
      const request = (mockBetterAuth.handler as jest.Mock).mock.calls[0][0];
      expect(request.url).toContain(
        '/api/auth/email-otp/send-verification-otp',
      );
    });

    it('관리자 활성화용 OTP 요청은 이메일을 정규화해 조회 및 발송한다', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.admin.id,
        userType: UserType.ADMIN,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const requestEmailVerificationSpy = jest
        .spyOn(authService, 'requestEmailVerification')
        .mockResolvedValue({ status: true });

      await authService.requestAdminActivationOtp(' ADMIN@EXAMPLE.COM ');

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
        select: { id: true, userType: true },
      });
      expect(requestEmailVerificationSpy).toHaveBeenCalledWith(
        'admin@example.com',
      );
    });

    it('관리자 활성화용 OTP 요청은 내부 발송 실패를 외부로 노출하지 않는다', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.admin.id,
        userType: UserType.ADMIN,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest
        .spyOn(authService, 'requestEmailVerification')
        .mockRejectedValue(new Error('smtp failed'));
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      try {
        const result = await authService.requestAdminActivationOtp(
          mockUsers.admin.email,
        );

        expect(result).toEqual({ status: true });
        const loggedPayload = (consoleErrorSpy as jest.Mock).mock.calls[0][1];

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[AuthService] admin activation OTP dispatch failed',
          expect.objectContaining({
            emailToken: expect.any(String),
            userId: mockUsers.admin.id,
            error: expect.any(Error),
          }),
        );
        expect(loggedPayload.emailToken).not.toBe(mockUsers.admin.email);
        expect(loggedPayload).not.toHaveProperty('email');
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });

    it('관리자 활성화용 OTP 검증은 pending admin 세션만 허용한다', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.admin.id,
        userType: UserType.ADMIN,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      jest.spyOn(authService, 'verifyEmailVerification').mockResolvedValue({
        user: mockUsers.admin,
        session: { token: 'otp-token' },
        setCookie: 'session_token=otp-cookie',
      });

      const result = await authService.verifyAdminActivationOtp(
        mockUsers.admin.email,
        '123456',
      );

      expect(result).toEqual({
        user: mockUsers.admin,
        session: { token: 'otp-token' },
        setCookie: 'session_token=otp-cookie',
      });
    });

    it('관리자 활성화용 OTP 검증은 이메일을 정규화한다', async () => {
      (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: mockUsers.admin.id,
        userType: UserType.ADMIN,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const verifyEmailVerificationSpy = jest
        .spyOn(authService, 'verifyEmailVerification')
        .mockResolvedValue({
          user: mockUsers.admin,
          session: { token: 'otp-token' },
          setCookie: 'session_token=otp-cookie',
        });

      await authService.verifyAdminActivationOtp(
        ' ADMIN@EXAMPLE.COM ',
        '123456',
      );

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'admin@example.com' },
        select: { id: true, userType: true },
      });
      expect(verifyEmailVerificationSpy).toHaveBeenCalledWith(
        'admin@example.com',
        '123456',
      );
    });

    it('관리자 활성화 완료 시 비밀번호 설정과 상태 전환이 함께 일어난다', async () => {
      mockBetterAuth.api.getSession.mockResolvedValue({
        user: mockUsers.admin,
        session: mockSession,
      });
      mockAdminRepo.findByUserId.mockResolvedValue({
        id: 'admin-profile-id',
        userId: mockUsers.admin.id,
        status: AdminProfileStatus.PENDING_ACTIVATION,
        isPrimaryAdmin: true,
        invitedByUserId: null,
        invitedAt: new Date(),
        activatedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockBetterAuth.api.setPassword.mockResolvedValue({ status: true });
      (mockPrisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUsers.admin,
        emailVerified: true,
        role: 'admin',
      });
      (mockPrisma.admin.update as jest.Mock).mockResolvedValue({
        id: 'admin-profile-id',
      });

      const result = await authService.completeAdminActivation(
        { cookie: 'session_token=otp-admin' },
        'Password123!',
      );

      expect(mockBetterAuth.api.setPassword).toHaveBeenCalledWith({
        headers: expect.anything(),
        body: { newPassword: 'Password123!' },
      });
      expect(mockPrisma.admin.update).toHaveBeenCalledWith({
        where: { userId: mockUsers.admin.id },
        data: expect.objectContaining({
          status: AdminProfileStatus.ACTIVE,
          activatedAt: expect.any(Date),
        }),
      });
      expect(result.user.emailVerified).toBe(true);
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

    it('내 비밀번호 변경 성공 시 다중 Set-Cookie를 함께 반환한다', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          token: null,
          user: mockUsers.student,
        }),
        headers: {
          getSetCookie: jest
            .fn()
            .mockReturnValue([
              'ssambee-auth.session_token=new-cookie; Path=/; HttpOnly',
              'ssambee-auth.session_data=new-data; Path=/; HttpOnly',
            ]),
          get: jest.fn().mockReturnValue(null),
        },
      };
      mockBetterAuth.handler.mockResolvedValue(mockResponse);

      const result = await authService.changeMyPassword(
        { cookie: 'session_token=test' },
        'password123!',
        'newPassword123!',
        true,
      );

      expect(result.setCookie).toEqual([
        'ssambee-auth.session_token=new-cookie; Path=/; HttpOnly',
        'ssambee-auth.session_data=new-data; Path=/; HttpOnly',
      ]);
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
