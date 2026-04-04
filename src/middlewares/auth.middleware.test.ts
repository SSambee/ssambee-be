import { Request, Response, NextFunction } from 'express';
import {
  createRequireAuth,
  createRequireAdmin,
  createOptionalAuth,
  requireUserType,
} from './auth.middleware.js';
import { UserType } from '../constants/auth.constant.js';
import {
  UnauthorizedException,
  ForbiddenException,
} from '../err/http.exception.js';
import {
  asInstructor,
  asAssistant,
  asStudent,
  asParent,
} from '../test/utils/auth.mock.js';
import {
  mockUsers,
  mockSession,
  mockProfiles,
} from '../test/fixtures/index.js';
import { createMockAuthService } from '../test/mocks/index.js';

describe('Auth Middleware - @unit #critical', () => {
  // Mock Request, Response, NextFunction
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  // Mock AuthService
  let mockAuthService: ReturnType<typeof createMockAuthService>;

  beforeEach(() => {
    // Reset
    jest.clearAllMocks();

    // Create mock AuthService
    mockAuthService = createMockAuthService();

    // Setup mock Request
    mockReq = {
      headers: {},
    };

    // Setup mock Response
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup mock NextFunction
    mockNext = jest.fn();
  });

  // ============================================
  // [RBAC-I01] requireAuth 미들웨어
  // ============================================

  describe('[RBAC-I01] requireAuth 미들웨어', () => {
    describe('비로그인 시 401 응답', () => {
      it('세션이 없으면 UnauthorizedException을 throw한다', async () => {
        // 준비
        mockAuthService.getSession.mockResolvedValue(null);
        const requireAuth = createRequireAuth(mockAuthService);

        // 실행 & Assert
        await expect(
          requireAuth(mockReq as Request, mockRes as Response, mockNext),
        ).rejects.toThrow(UnauthorizedException);
      });
    });

    describe('로그인 시 req.user 설정', () => {
      it('유효한 세션이 있으면 req.user를 설정하고 next()를 호출한다', async () => {
        // 준비
        mockAuthService.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
        });
        const requireAuth = createRequireAuth(mockAuthService);

        // 실행
        await requireAuth(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockReq.user).toBeDefined();
        expect(mockReq.user?.id).toBe(mockUsers.instructor.id);
        expect(mockReq.user?.userType).toBe(UserType.INSTRUCTOR);
        expect(mockReq.authSession).toEqual(mockSession);
        expect(mockReq.profile).toEqual(mockProfiles.instructor);
        expect(mockNext).toHaveBeenCalledWith();
        expect(
          mockAuthService.getSessionWithInstructorBillingSummary,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe('[RBAC-I01-A] requireAdmin 미들웨어', () => {
    it('활성화된 관리자면 next()를 호출한다', async () => {
      mockReq.user = {
        ...mockUsers.admin,
        userType: UserType.ADMIN,
        role: 'admin',
      };
      mockAuthService.ensureAdminAccess.mockResolvedValue({
        id: 'admin-row-id',
        userId: mockUsers.admin.id,
        status: 'ACTIVE',
        isPrimaryAdmin: true,
      } as never);

      const requireAdmin = createRequireAdmin(mockAuthService);

      await requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockAuthService.ensureAdminAccess).toHaveBeenCalledWith(
        mockUsers.admin.id,
      );
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('관리자가 아니면 ForbiddenException을 전달한다', async () => {
      mockReq.user = asInstructor();
      const requireAdmin = createRequireAdmin(mockAuthService);

      await requireAdmin(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      expect(mockAuthService.ensureAdminAccess).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // [RBAC-I02] requireInstructor 미들웨어
  // ============================================

  describe('[RBAC-I02] requireInstructor 미들웨어', () => {
    const requireInstructor = requireUserType(UserType.INSTRUCTOR);

    describe('강사만 통과', () => {
      it('강사 역할이면 next()를 호출한다', () => {
        // 준비
        mockReq.user = asInstructor();

        // 실행
        requireInstructor(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('조교 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asAssistant();

        // 실행
        requireInstructor(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학생 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asStudent();

        // 실행
        requireInstructor(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학부모 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asParent();

        // 실행
        requireInstructor(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('user가 없으면 UnauthorizedException을 전달한다', () => {
        // 준비
        mockReq.user = undefined;

        // 실행
        requireInstructor(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(
          expect.any(UnauthorizedException),
        );
      });
    });
  });

  // ============================================
  // [RBAC-I03] requireInstructorOrAssistant 미들웨어
  // ============================================

  describe('[RBAC-I03] requireInstructorOrAssistant 미들웨어', () => {
    const requireInstructorOrAssistant = requireUserType(
      UserType.INSTRUCTOR,
      UserType.ASSISTANT,
    );

    describe('강사/조교 통과', () => {
      it('강사 역할이면 next()를 호출한다', () => {
        // 준비
        mockReq.user = asInstructor();

        // 실행
        requireInstructorOrAssistant(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('조교 역할이면 next()를 호출한다', () => {
        // 준비
        mockReq.user = asAssistant();
        mockReq.profile = mockProfiles.assistant;

        // 실행
        requireInstructorOrAssistant(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('학생 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asStudent();

        // 실행
        requireInstructorOrAssistant(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학부모 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asParent();

        // 실행
        requireInstructorOrAssistant(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });
    });
  });

  // ============================================
  // [RBAC-I04] requireStudent 미들웨어
  // ============================================

  describe('[RBAC-I04] requireStudent 미들웨어', () => {
    const requireStudent = requireUserType(UserType.STUDENT);

    describe('학생만 통과', () => {
      it('학생 역할이면 next()를 호출한다', () => {
        // 준비
        mockReq.user = asStudent();

        // 실행
        requireStudent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('강사 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asInstructor();

        // 실행
        requireStudent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('조교 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asAssistant();

        // 실행
        requireStudent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학부모 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asParent();

        // 실행
        requireStudent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });
    });
  });

  // ============================================
  // [RBAC-I05] requireParent 미들웨어
  // ============================================

  describe('[RBAC-I05] requireParent 미들웨어', () => {
    const requireParent = requireUserType(UserType.PARENT);

    describe('학부모만 통과', () => {
      it('학부모 역할이면 next()를 호출한다', () => {
        // 준비
        mockReq.user = asParent();

        // 실행
        requireParent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('강사 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asInstructor();

        // 실행
        requireParent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학생 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asStudent();

        // 실행
        requireParent(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });
    });
  });

  // ============================================
  // [RBAC-I06] requireUserType 미들웨어
  // ============================================

  describe('[RBAC-I06] requireUserType 미들웨어', () => {
    describe('잘못된 userType 시 403 응답', () => {
      it('허용되지 않은 역할이면 ForbiddenException을 전달한다', () => {
        // 준비
        mockReq.user = asInstructor();
        const onlyStudentMiddleware = requireUserType(UserType.STUDENT);

        // 실행
        onlyStudentMiddleware(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('여러 역할 중 하나라도 일치하면 통과한다', () => {
        // 준비
        mockReq.user = asInstructor();
        const multiRoleMiddleware = requireUserType(
          UserType.INSTRUCTOR,
          UserType.ASSISTANT,
        );

        // 실행
        multiRoleMiddleware(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  // ============================================
  // optionalAuth 미들웨어
  // ============================================

  describe('optionalAuth 미들웨어', () => {
    describe('선택적 인증', () => {
      it('세션이 있으면 req.user를 설정하고 next()를 호출한다', async () => {
        // 준비
        mockAuthService.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
        });
        const optionalAuth = createOptionalAuth(mockAuthService);

        // 실행
        await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockReq.user).toBeDefined();
        expect(mockReq.user?.id).toBe(mockUsers.instructor.id);
        expect(mockNext).toHaveBeenCalledWith();
        expect(
          mockAuthService.getSessionWithInstructorBillingSummary,
        ).not.toHaveBeenCalled();
      });

      it('세션이 없어도 에러 없이 next()를 호출한다', async () => {
        // 준비
        mockAuthService.getSession.mockResolvedValue(null);
        const optionalAuth = createOptionalAuth(mockAuthService);

        // 실행
        await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockReq.user).toBeUndefined();
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('세션 조회 중 에러가 발생해도 next()를 호출한다', async () => {
        // 준비
        mockAuthService.getSession.mockRejectedValue(
          new Error('Session error'),
        );
        const optionalAuth = createOptionalAuth(mockAuthService);

        // 실행
        await optionalAuth(mockReq as Request, mockRes as Response, mockNext);

        // 검증
        expect(mockReq.user).toBeUndefined();
        expect(mockNext).toHaveBeenCalledWith();
      });
    });
  });

  // ============================================
  // Permission Matrix (통합 시나리오)
  // ============================================

  describe('Permission Matrix', () => {
    describe('Management API (강사/조교 전용)', () => {
      const managementMiddleware = requireUserType(
        UserType.INSTRUCTOR,
        UserType.ASSISTANT,
      );

      it('강사 접근 시 통과 (200)', () => {
        mockReq.user = asInstructor();
        managementMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('조교 접근 시 통과 (200)', () => {
        mockReq.user = asAssistant();
        mockReq.profile = mockProfiles.assistant;
        managementMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('학생 접근 시 거부 (403)', () => {
        mockReq.user = asStudent();
        managementMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('학부모 접근 시 거부 (403)', () => {
        mockReq.user = asParent();
        managementMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('비로그인 접근 시 거부 (401)', () => {
        mockReq.user = undefined;
        managementMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(
          expect.any(UnauthorizedException),
        );
      });
    });

    describe('Service API (학생/학부모 전용)', () => {
      const serviceMiddleware = requireUserType(
        UserType.STUDENT,
        UserType.PARENT,
      );

      it('학생 접근 시 통과 (200)', () => {
        mockReq.user = asStudent();
        serviceMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('학부모 접근 시 통과 (200)', () => {
        mockReq.user = asParent();
        serviceMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith();
      });

      it('강사 접근 시 거부 (403)', () => {
        mockReq.user = asInstructor();
        serviceMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('조교 접근 시 거부 (403)', () => {
        mockReq.user = asAssistant();
        serviceMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
      });

      it('비로그인 접근 시 거부 (401)', () => {
        mockReq.user = undefined;
        serviceMiddleware(mockReq as Request, mockRes as Response, mockNext);
        expect(mockNext).toHaveBeenCalledWith(
          expect.any(UnauthorizedException),
        );
      });
    });
  });
});
