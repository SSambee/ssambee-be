import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AUTH_COOKIE_NAMES, UserType } from '../constants/auth.constant.js';
import {
  ForbiddenException,
  UnauthorizedException,
} from '../err/http.exception.js';
import { successResponse } from '../utils/response.util.js';
import { AuthResponse } from '../types/auth.types.js';
import { config, isProduction } from '../config/env.config.js';

const getCrossDomainCookie = (): string | undefined => {
  const toSharedCookieDomain = (value?: string): string | undefined => {
    if (!value) {
      return undefined;
    }

    let hostname = value.trim().toLowerCase();

    if (hostname.includes('://')) {
      try {
        hostname = new URL(hostname).hostname;
      } catch (_error) {
        return undefined;
      }
    } else {
      hostname = hostname.split(':')[0].split('/')[0];
    }

    if (!hostname || hostname === 'localhost') {
      return undefined;
    }

    const host = hostname.startsWith('.') ? hostname.substring(1) : hostname;
    const segments = host.split('.');

    if (segments.length < 2) {
      return undefined;
    }

    const baseDomain = segments.slice(-2).join('.');
    return `.${baseDomain}`;
  };

  return toSharedCookieDomain(
    config.AUTH_COOKIE_DOMAIN || config.BETTER_AUTH_URL,
  );
};

const crossDomainCookie = getCrossDomainCookie();

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
    AUTH_COOKIE_NAMES.forEach((cookieName) => {
      res.cookie(cookieName, '', {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'lax',
        path: '/',
        ...(crossDomainCookie ? { domain: crossDomainCookie } : {}),
        expires: new Date(0), // 1970년으로 설정하여 즉시 삭제 유도
      });
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

  /** 관리자 로그인 */
  adminSignIn = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, rememberMe } = req.body;

      const result = await this.authService.signInAdmin(
        email,
        password,
        !!rememberMe,
      );

      this.handleAuthResponse(res, result, '관리자 로그인 성공', 200);
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

  /** 이메일 인증 링크 검증(공통) */
  verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
    await this.verifyEmailWithScope(req, res, next);
  };

  /** 이메일 인증 링크 검증(학생/학부모) */
  verifyEmailForSvc = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    await this.verifyEmailWithScope(req, res, next, [
      UserType.STUDENT,
      UserType.PARENT,
    ]);
  };

  /** 이메일 인증 링크 검증(강사/조교) */
  verifyEmailForMgmt = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    await this.verifyEmailWithScope(req, res, next, [
      UserType.INSTRUCTOR,
      UserType.ASSISTANT,
    ]);
  };

  /** 이메일 인증 링크 공통 처리 */
  private verifyEmailWithScope = async (
    req: Request,
    res: Response,
    next: NextFunction,
    allowedUserTypes: UserType[] = [],
  ) => {
    try {
      const { token } = req.query;
      if (typeof token !== 'string' || token.trim().length === 0) {
        return next(new ForbiddenException('유효하지 않은 인증 토큰입니다.'));
      }

      const result = await this.authService.verifyEmailWithToken(token);
      const userType =
        result.user && typeof result.user.userType === 'string'
          ? result.user.userType
          : undefined;

      if (
        allowedUserTypes.length > 0 &&
        (!userType || !allowedUserTypes.includes(userType as UserType))
      ) {
        return next(
          new ForbiddenException(
            '해당 링크는 올바르지 않은 사용자 유형입니다.',
          ),
        );
      }

      if (result.setCookie) {
        res.setHeader('Set-Cookie', result.setCookie);
      }

      if (result.redirectTo) {
        return res.redirect(result.redirectTo);
      }

      return successResponse(res, {
        message: '이메일 인증이 완료되었습니다.',
        data: {
          status: result.status,
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
      const { newEmail } = req.body;
      await this.authService.changeMyEmail(req.headers, newEmail);

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
      const { email } = req.body;
      await this.authService.findPassword(email);

      return successResponse(res, {
        message:
          '계정이 존재하면 비밀번호 재설정 메일이 발송됩니다. 메일함을 확인해주세요.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** OTP 기반 비밀번호 재설정 */
  resetPassword = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, otp, newPassword } = req.body;
      await this.authService.resetPasswordWithOTP(email, otp, newPassword);

      return successResponse(res, {
        message: '비밀번호가 재설정되었습니다.',
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
      const session =
        await this.authService.getSessionWithInstructorBillingSummary(
          req.headers,
        );
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

  /** 관리자 세션 조회 */
  getAdminSession = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const session = await this.authService.getAdminSession(req.headers);
      if (!session) {
        throw new UnauthorizedException('인증이 필요합니다.');
      }

      return successResponse(res, { data: session });
    } catch (error) {
      this.clearSessionCookie(res);
      next(error);
    }
  };
}
