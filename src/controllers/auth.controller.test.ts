import { Request, Response, NextFunction } from 'express';
import { AuthController } from './auth.controller.js';
import { UserType } from '../constants/auth.constant.js';
import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '../err/http.exception.js';
import { createMockAuthService } from '../test/mocks/index.js';
import {
  mockUsers,
  mockSession,
  signUpRequests,
  signInRequests,
  mockProfiles,
} from '../test/fixtures/index.js';

describe('AuthController - @unit #critical', () => {
  // AuthService Mock 객체
  let mockAuthService: ReturnType<typeof createMockAuthService>;
  let authController: AuthController;

  // Express Request, Response, NextFunction Mock 객체
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();

    // 팩토리 함수를 사용하여 AuthService Mock 생성
    mockAuthService = createMockAuthService();

    // 의존성 주입(DI)을 통해 AuthController 생성
    authController = new AuthController(mockAuthService);

    // Request Mock 설정
    mockReq = {
      body: {},
      headers: {},
    };

    // Response Mock 설정
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      redirect: jest.fn(),
    };

    // NextFunction Mock 설정
    mockNext = jest.fn();
  });

  // ============================================
  // [인증 (Login)] 테스트 케이스
  // ============================================

  describe('[인증] 회원가입', () => {
    describe('AUTH-01: 강사 회원가입 API', () => {
      it('POST /instructor/signup - 성공 시 201과 사용자 정보 반환', async () => {
        // 준비
        mockReq.body = signUpRequests.instructor;

        mockAuthService.completeSignUpWithVerifiedEmail.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
          setCookie: 'session_token=test-cookie',
        });

        // 실행
        await authController.instructorSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        // 검증
        expect(
          mockAuthService.completeSignUpWithVerifiedEmail,
        ).toHaveBeenCalledWith(
          UserType.INSTRUCTOR,
          mockReq.body,
          mockReq.headers,
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            message: '회원가입이 완료되었습니다.',
            data: {
              user: mockUsers.instructor,
              profile: mockProfiles.instructor,
            },
          }),
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Set-Cookie',
          'session_token=test-cookie',
        );
      });

      it('POST /instructor/signup - 실패 시 에러를 next로 전달', async () => {
        mockReq.body = signUpRequests.instructor;

        const error = new BadRequestException('이미 가입된 전화번호입니다.');
        mockAuthService.completeSignUpWithVerifiedEmail.mockRejectedValue(
          error,
        );

        await authController.instructorSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith(error);
      });
    });

    describe('AUTH-02: 조교 회원가입 API', () => {
      it('POST /assistant/signup - 성공 시 201과 사용자 정보 반환', async () => {
        mockReq.body = signUpRequests.assistant;

        mockAuthService.completeSignUpWithVerifiedEmail.mockResolvedValue({
          user: mockUsers.assistant,
          session: mockSession,
          profile: mockProfiles.assistant,
          setCookie: 'session_token=test-cookie',
        });

        await authController.assistantSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(
          mockAuthService.completeSignUpWithVerifiedEmail,
        ).toHaveBeenCalledWith(
          UserType.ASSISTANT,
          mockReq.body,
          mockReq.headers,
        );
        expect(mockRes.status).toHaveBeenCalledWith(201);
      });
    });

    describe('AUTH-03: 학생 회원가입 API', () => {
      it('POST /student/signup - 성공 시 201과 사용자 정보 반환', async () => {
        mockReq.body = signUpRequests.student;

        mockAuthService.completeSignUpWithVerifiedEmail.mockResolvedValue({
          user: mockUsers.student,
          session: mockSession,
          profile: mockProfiles.student,
          setCookie: 'session_token=test-cookie',
        });

        await authController.studentSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(
          mockAuthService.completeSignUpWithVerifiedEmail,
        ).toHaveBeenCalledWith(UserType.STUDENT, mockReq.body, mockReq.headers);
        expect(mockRes.status).toHaveBeenCalledWith(201);
      });
    });

    describe('AUTH-04: 학부모 회원가입 API', () => {
      it('POST /parent/signup - 성공 시 201과 사용자 정보 반환', async () => {
        mockReq.body = signUpRequests.parent;

        mockAuthService.completeSignUpWithVerifiedEmail.mockResolvedValue({
          user: mockUsers.parent,
          session: mockSession,
          profile: mockProfiles.parent,
          setCookie: 'session_token=test-cookie',
        });

        await authController.parentSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(
          mockAuthService.completeSignUpWithVerifiedEmail,
        ).toHaveBeenCalledWith(UserType.PARENT, mockReq.body, mockReq.headers);
        expect(mockRes.status).toHaveBeenCalledWith(201);
      });
    });
  });

  describe('[인증] 로그인', () => {
    describe('AUTH-05: 로그인 API', () => {
      it('POST /signin - 성공 시 200과 세션 쿠키 발급', async () => {
        mockReq.body = {
          ...signInRequests.instructor,
          userType: UserType.INSTRUCTOR,
          rememberMe: true,
        };

        mockAuthService.signIn.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
          setCookie: 'session_token=test-cookie',
        });

        await authController.signIn(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockAuthService.signIn).toHaveBeenCalledWith(
          mockReq.body.email,
          mockReq.body.password,
          mockReq.body.userType,
          true,
        );
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            message: '로그인 성공',
            data: expect.objectContaining({
              user: mockUsers.instructor,
            }),
          }),
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'Set-Cookie',
          'session_token=test-cookie',
        );
      });

      it('POST /signin - rememberMe가 false면 세션 쿠키로 설정', async () => {
        mockReq.body = {
          ...signInRequests.instructor,
          userType: UserType.INSTRUCTOR,
          rememberMe: false,
        };

        mockAuthService.signIn.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
          setCookie: 'session_token=test-cookie',
        });

        await authController.signIn(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockAuthService.signIn).toHaveBeenCalledWith(
          mockReq.body.email,
          mockReq.body.password,
          mockReq.body.userType,
          false,
        );
      });
    });
  });

  describe('[인증] 이메일 인증(OTP)', () => {
    it('POST /email-verification - otp 없이 요청하면 인증코드를 발송한다', async () => {
      mockReq.body = { email: mockUsers.student.email };
      mockAuthService.requestEmailVerification.mockResolvedValue({
        status: true,
      });

      await authController.emailVerification(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.requestEmailVerification).toHaveBeenCalledWith(
        mockUsers.student.email,
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: '이메일 인증코드를 전송했습니다.',
        }),
      );
    });

    it('POST /email-verification - otp 포함 요청이면 인증을 완료하고 쿠키를 설정한다', async () => {
      mockReq.body = { email: mockUsers.student.email, otp: '123456' };
      mockAuthService.verifyEmailVerification.mockResolvedValue({
        user: mockUsers.student,
        session: { token: 'otp-token' },
        setCookie: 'session_token=otp-cookie',
      });

      await authController.emailVerification(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.verifyEmailVerification).toHaveBeenCalledWith(
        mockUsers.student.email,
        '123456',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=otp-cookie',
      );
    });

    it('GET /svc/auth/verify-email - svc 사용자 링크를 검증한다', async () => {
      mockReq.query = { token: 'token-for-student' };
      mockAuthService.verifyEmailWithToken.mockResolvedValue({
        status: true,
        user: mockUsers.student,
        setCookie: 'session_token=verified-cookie',
      });

      await authController.verifyEmailForSvc(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.verifyEmailWithToken).toHaveBeenCalledWith(
        'token-for-student',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=verified-cookie',
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: '이메일 인증이 완료되었습니다.',
          data: expect.objectContaining({
            status: true,
            user: mockUsers.student,
          }),
        }),
      );
    });

    it('GET /public/auth/verify-email - 타입 제한 없이 인증을 완료한다', async () => {
      mockReq.query = { token: 'token-for-instructor' };
      mockAuthService.verifyEmailWithToken.mockResolvedValue({
        status: true,
        user: mockUsers.instructor,
        setCookie: 'session_token=verified-cookie',
      });

      await authController.verifyEmail(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.verifyEmailWithToken).toHaveBeenCalledWith(
        'token-for-instructor',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=verified-cookie',
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: '이메일 인증이 완료되었습니다.',
          data: expect.objectContaining({
            status: true,
            user: mockUsers.instructor,
          }),
        }),
      );
    });

    it('GET /mgmt/auth/verify-email - mgmt 사용자 링크를 검증한다', async () => {
      mockReq.query = { token: 'token-for-instructor' };
      mockAuthService.verifyEmailWithToken.mockResolvedValue({
        status: true,
        user: mockUsers.instructor,
        setCookie: 'session_token=verified-cookie',
      });

      await authController.verifyEmailForMgmt(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.verifyEmailWithToken).toHaveBeenCalledWith(
        'token-for-instructor',
      );
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: '이메일 인증이 완료되었습니다.',
          data: expect.objectContaining({
            status: true,
            user: mockUsers.instructor,
          }),
        }),
      );
    });

    it('GET /svc/auth/verify-email - 권한이 맞지 않는 사용자 타입이면 실패한다', async () => {
      mockReq.query = { token: 'token-for-instructor' };
      mockAuthService.verifyEmailWithToken.mockResolvedValue({
        status: true,
        user: mockUsers.instructor,
      });

      await authController.verifyEmailForSvc(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(ForbiddenException));
    });
  });

  describe('[인증] 이메일/비밀번호 관리', () => {
    it('PATCH /me/email - 이메일 변경 인증 메일을 요청한다', async () => {
      mockReq.headers = { cookie: 'session_token=test' };
      mockReq.body = { newEmail: 'new@example.com' };
      mockAuthService.changeMyEmail.mockResolvedValue({ status: true });

      await authController.changeMyEmail(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.changeMyEmail).toHaveBeenCalledWith(
        mockReq.headers,
        'new@example.com',
      );
    });

    it('PATCH /me/password - 비밀번호 변경 성공 시 쿠키를 갱신한다', async () => {
      mockReq.headers = { cookie: 'session_token=test' };
      mockReq.body = {
        currentPassword: 'password123!',
        newPassword: 'newPassword123!',
        revokeOtherSessions: true,
      };
      mockAuthService.changeMyPassword.mockResolvedValue({
        token: null,
        user: mockUsers.student,
        setCookie: 'session_token=updated-cookie',
      });

      await authController.changeMyPassword(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.changeMyPassword).toHaveBeenCalledWith(
        mockReq.headers,
        'password123!',
        'newPassword123!',
        true,
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=updated-cookie',
      );
    });

    it('POST /find-password - 비밀번호 찾기를 요청한다', async () => {
      mockReq.body = { email: mockUsers.student.email };
      mockAuthService.findPassword.mockResolvedValue({
        success: true,
      });

      await authController.findPassword(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.findPassword).toHaveBeenCalledWith(
        mockUsers.student.email,
      );
    });

    it('POST /reset-password - OTP로 비밀번호 재설정을 시도한다', async () => {
      mockReq.body = {
        email: mockUsers.student.email,
        otp: '123456',
        newPassword: 'newPassword123!',
      };
      mockAuthService.resetPasswordWithOTP.mockResolvedValue({ success: true });

      await authController.resetPassword(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockAuthService.resetPasswordWithOTP).toHaveBeenCalledWith(
        mockUsers.student.email,
        '123456',
        'newPassword123!',
      );
    });
  });

  describe('[인증] 로그아웃', () => {
    describe('AUTH-06: 로그아웃 API', () => {
      it('POST /signout - 성공 시 쿠키 삭제 및 성공 메시지 반환', async () => {
        mockReq.headers = { cookie: 'session_token=test-token' };
        mockAuthService.signOut.mockResolvedValue({ success: true });

        await authController.signOut(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockAuthService.signOut).toHaveBeenCalledWith(mockReq.headers);
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            message: '로그아웃 되었습니다.',
          }),
        );
      });
    });
  });

  describe('[인증] 세션 조회', () => {
    describe('AUTH-07: 세션 조회 API', () => {
      it('GET /session - 유효한 세션 시 사용자 정보 반환', async () => {
        mockReq.headers = { cookie: 'session_token=test-token' };
        mockAuthService.getSession.mockResolvedValue({
          user: mockUsers.instructor,
          session: mockSession,
          profile: mockProfiles.instructor,
        });

        await authController.getSession(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockAuthService.getSession).toHaveBeenCalledWith(
          mockReq.headers,
        );
        expect(mockRes.json).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'success',
            data: expect.objectContaining({
              user: mockUsers.instructor,
              session: mockSession,
              profile: mockProfiles.instructor,
            }),
          }),
        );
      });

      it('GET /session - 세션 없을 시 401 에러', async () => {
        mockReq.headers = {};
        mockAuthService.getSession.mockResolvedValue(null);

        await authController.getSession(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith(
          expect.any(UnauthorizedException),
        );
      });
    });
  });

  // ============================================
  // [예외 케이스] 테스트
  // ============================================

  describe('[예외] 에러 핸들링', () => {
    describe('ERR-01: 중복 이메일', () => {
      it('중복 이메일 회원가입 시 에러를 next로 전달', async () => {
        mockReq.body = signUpRequests.instructor;

        const error = new BadRequestException('이미 존재하는 이메일입니다.');
        mockAuthService.completeSignUpWithVerifiedEmail.mockRejectedValue(
          error,
        );

        await authController.instructorSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith(error);
      });
    });

    describe('ERR-02: 잘못된 비밀번호', () => {
      it('잘못된 비밀번호 로그인 시 에러를 next로 전달', async () => {
        mockReq.body = {
          email: mockUsers.instructor.email,
          password: 'wrong-password',
          userType: UserType.INSTRUCTOR,
        };

        const error = new UnauthorizedException(
          '이메일 또는 비밀번호가 올바르지 않습니다.',
        );
        mockAuthService.signIn.mockRejectedValue(error);

        await authController.signIn(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith(error);
      });
    });

    describe('ERR-04: 잘못된 조교 코드', () => {
      it('유효하지 않은 조교 코드 사용 시 에러를 next로 전달', async () => {
        mockReq.body = {
          ...signUpRequests.assistant,
          signupCode: 'INVALID-CODE',
        };

        const error = new BadRequestException(
          '유효하지 않거나 만료된 조교가입코드입니다.',
        );
        mockAuthService.completeSignUpWithVerifiedEmail.mockRejectedValue(
          error,
        );

        await authController.assistantSignUp(
          mockReq as Request,
          mockRes as Response,
          mockNext,
        );

        expect(mockNext).toHaveBeenCalledWith(error);
      });
    });
  });

  // ============================================
  // 쿠키 설정 테스트
  // ============================================

  describe('쿠키 설정', () => {
    it('session에 token이 있으면 쿠키에 설정한다', async () => {
      mockReq.body = {
        ...signInRequests.instructor,
        userType: UserType.INSTRUCTOR,
      };

      mockAuthService.signIn.mockResolvedValue({
        user: mockUsers.instructor,
        session: { token: 'session-token' },
        profile: mockProfiles.instructor,
        setCookie: 'session_token=test-cookie',
      });

      await authController.signIn(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=test-cookie',
      );
    });

    it('result.token이 있으면 쿠키에 설정한다 (session이 없는 경우)', async () => {
      mockReq.body = {
        ...signInRequests.instructor,
        userType: UserType.INSTRUCTOR,
      };

      mockAuthService.signIn.mockResolvedValue({
        user: mockUsers.instructor,
        session: null,
        profile: mockProfiles.instructor,
        setCookie: 'session_token=test-cookie',
      });

      await authController.signIn(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Set-Cookie',
        'session_token=test-cookie',
      );
    });
  });
});
