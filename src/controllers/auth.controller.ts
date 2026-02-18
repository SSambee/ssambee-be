import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AUTH_COOKIE_NAME, UserType } from '../constants/auth.constant.js';
import { UnauthorizedException } from '../err/http.exception.js';
import { successResponse } from '../utils/response.util.js';
import { AuthResponse } from '../types/auth.types.js';
import { isProduction } from '../config/env.config.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private handleAuthResponse = (
    res: Response,
    result: AuthResponse,
    message: string,
    statusCode: number = 200,
  ) => {
    // Better Auth Handler로부터 받은 쿠키가 있으면 설정
    if (result.setCookie) {
      res.setHeader('Set-Cookie', result.setCookie);
    }

    return successResponse(res, {
      statusCode,
      message,
      data: {
        user: result.user,
        profile: result.profile,
      },
    });
  };

  private clearSessionCookie = (res: Response) => {
    res.cookie(AUTH_COOKIE_NAME, '', {
      httpOnly: true,
      secure: isProduction(),
      sameSite: 'lax',
      path: '/',
      expires: new Date(0), // 1970년으로 설정하여 즉시 삭제 유도
    });
  };

  /** 강사 회원가입 */
  instructorSignUp = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.authService.completeSignUpWithVerifiedEmail(
        UserType.INSTRUCTOR,
        req.body,
        req.headers,
      );
      this.handleAuthResponse(res, result, '회원가입이 완료되었습니다.', 201);
    } catch (error) {
      next(error);
    }
  };

  /** 조교 회원가입 */
  assistantSignUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.completeSignUpWithVerifiedEmail(
        UserType.ASSISTANT,
        req.body,
        req.headers,
      );
      this.handleAuthResponse(res, result, '회원가입이 완료되었습니다.', 201);
    } catch (error) {
      next(error);
    }
  };

  /** 학생 회원가입 */
  studentSignUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.completeSignUpWithVerifiedEmail(
        UserType.STUDENT,
        req.body,
        req.headers,
      );
      this.handleAuthResponse(res, result, '회원가입이 완료되었습니다.', 201);
    } catch (error) {
      next(error);
    }
  };

  /** 학부모 회원가입 */
  parentSignUp = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.authService.completeSignUpWithVerifiedEmail(
        UserType.PARENT,
        req.body,
        req.headers,
      );
      this.handleAuthResponse(res, result, '회원가입이 완료되었습니다.', 201);
    } catch (error) {
      next(error);
    }
  };

  /** 통합 로그인 */
  signIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, userType, rememberMe } = req.body;

      const result = await this.authService.signIn(
        email,
        password,
        userType,
        !!rememberMe,
      );

      this.handleAuthResponse(res, result, '로그인 성공', 200);
    } catch (error) {
      next(error);
    }
  };

  /** 이메일 인증코드 발송/검증 */
  emailVerification = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { email, otp } = req.body;

      if (!otp) {
        await this.authService.requestEmailVerification(email);
        return successResponse(res, {
          message: '이메일 인증코드를 전송했습니다.',
        });
      }

      const result = await this.authService.verifyEmailVerification(email, otp);
      if (result.setCookie) {
        res.setHeader('Set-Cookie', result.setCookie);
      }

      return successResponse(res, {
        message: '이메일 인증이 완료되었습니다.',
        data: {
          user: result.user,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /** 내 이메일 변경 */
  changeMyEmail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { newEmail, callbackURL } = req.body;
      await this.authService.changeMyEmail(req.headers, newEmail, callbackURL);

      return successResponse(res, {
        message: '이메일 변경 인증 메일을 전송했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 내 비밀번호 변경 */
  changeMyPassword = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { currentPassword, newPassword, revokeOtherSessions } = req.body;

      const result = await this.authService.changeMyPassword(
        req.headers,
        currentPassword,
        newPassword,
        !!revokeOtherSessions,
      );

      if (result.setCookie) {
        res.setHeader('Set-Cookie', result.setCookie);
      }

      return successResponse(res, {
        message: '비밀번호가 변경되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 이메일 기반 비밀번호 찾기 */
  findPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, redirectTo } = req.body;
      await this.authService.findPassword(email, redirectTo);

      return successResponse(res, {
        message:
          '계정이 존재하면 비밀번호 재설정 메일이 발송됩니다. 메일함을 확인해주세요.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 로그아웃 */
  signOut = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Better Auth는 헤더에서 세션을 파싱하므로 req.headers를 전달
      await this.authService.signOut(req.headers);
      this.clearSessionCookie(res);
      return successResponse(res, { message: '로그아웃 되었습니다.' });
    } catch (error) {
      next(error);
    }
  };

  /** 세션 조회 */
  getSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await this.authService.getSession(req.headers);
      if (!session) {
        throw new UnauthorizedException('인증이 필요합니다.');
      }

      return successResponse(res, { data: session });
    } catch (error) {
      // 세션 조회에 실패한 모든 경우(세션 없음, DB 오류 등)에
      // 클라이언트의 쿠키를 정리해주는 것이 안전합니다.
      this.clearSessionCookie(res);
      next(error);
    }
  };
}
