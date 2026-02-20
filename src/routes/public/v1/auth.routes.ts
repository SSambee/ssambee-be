import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  findPasswordSchema,
  emailVerificationSchema,
  verifyEmailQuerySchema,
  resetPasswordSchema,
  signInSchema,
} from '../../../validations/auth.validation.js';
import { RequestHandler } from 'express';

const defaultVerifyEmailHandler = container.authController.verifyEmail.bind(
  container.authController,
);

export const createPublicAuthRoutes = ({
  verifyEmailHandler = defaultVerifyEmailHandler,
}: {
  verifyEmailHandler?: RequestHandler;
} = {}) => {
  const publicAuthRouter = Router();

  /** 로그인 */
  publicAuthRouter.post(
    '/signin',
    validate(signInSchema),
    container.authController.signIn.bind(container.authController),
  );

  /** 이메일 인증코드 발송/검증 */
  publicAuthRouter.post(
    '/email-verification',
    validate(emailVerificationSchema),
    container.authController.emailVerification.bind(container.authController),
  );

  /** 이메일 인증 링크 완료 */
  publicAuthRouter.get(
    '/verify-email',
    validate(verifyEmailQuerySchema, 'query'),
    verifyEmailHandler,
  );

  /** 이메일 기반 비밀번호 찾기 요청 */
  publicAuthRouter.post(
    '/find-password',
    validate(findPasswordSchema),
    container.authController.findPassword.bind(container.authController),
  );

  /** 비밀번호 재설정(OTP) */
  publicAuthRouter.post(
    '/reset-password',
    validate(resetPasswordSchema),
    container.authController.resetPassword.bind(container.authController),
  );

  /** 로그아웃 */
  publicAuthRouter.post(
    '/signout',
    container.authController.signOut.bind(container.authController),
  );

  /** 세션 조회 */
  publicAuthRouter.get(
    '/session',
    container.authController.getSession.bind(container.authController),
  );

  return publicAuthRouter;
};
