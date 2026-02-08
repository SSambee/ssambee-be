import { Request, Response, NextFunction } from 'express';
import { AssistantStatus, UserType } from '../constants/auth.constant.js';
import type {
  AuthSession,
  ProfileBase,
  ProfileAssistant,
} from '../types/auth.types.js';
import {
  UnauthorizedException,
  ForbiddenException,
} from '../err/http.exception.js';
import type { AuthService } from '../services/auth.service.js';

// Request 타입 확장
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        userType: UserType;
        name: string;
        image?: string | null;
      };
      profile?: ProfileBase | null;
      authSession?: AuthSession | { token: string } | null;
    }
  }
}

/**
 * 인증 미들웨어 Factory
 * AuthService를 주입받아 requireAuth 미들웨어를 생성합니다.
 */
export const createRequireAuth = (authService: AuthService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const result = await authService.getSession(req.headers);

    if (!result) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    req.user = {
      ...result.user,
      userType: result.user.userType as UserType,
    };
    req.authSession = result.session;
    req.profile = result.profile;

    next();
  };
};

/**
 * 특정 UserType만 허용하는 미들웨어 Factory
 */
export const requireUserType = (...allowedTypes: UserType[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedException('인증이 필요합니다.'));
    }

    if (!allowedTypes.includes(req.user.userType)) {
      return next(new ForbiddenException('접근 권한이 없습니다.'));
    }

    if (req.user.userType === UserType.ASSISTANT) {
      const assistantProfile = req.profile as unknown as ProfileAssistant;
      if (assistantProfile?.signStatus !== AssistantStatus.SIGNED) {
        return next(
          new ForbiddenException(
            '접근 권한이 없습니다. 담당자의 승인이 필요합니다.',
          ),
        );
      }
    }

    next();
  };
};

/**
 * 역할별 미들웨어 생성 Helper
 */
export const createRoleMiddlewares = () => ({
  requireInstructor: requireUserType(UserType.INSTRUCTOR),
  requireInstructorOrAssistant: requireUserType(
    UserType.INSTRUCTOR,
    UserType.ASSISTANT,
  ),
  requireStudent: requireUserType(UserType.STUDENT),
  requireParent: requireUserType(UserType.PARENT),
});

/**
 * 선택적 인증 미들웨어 Factory
 * 로그인하지 않아도 통과하며, 로그인 시 user 정보를 추가합니다.
 */
export const createOptionalAuth = (authService: AuthService) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.getSession(req.headers);
      if (result) {
        req.user = {
          ...result.user,
          userType: result.user.userType as UserType,
        };
        req.authSession = result.session;
        req.profile = result.profile;
      }
      next();
    } catch (_error) {
      next();
    }
  };
};
