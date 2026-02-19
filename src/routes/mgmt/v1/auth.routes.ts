import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  findPasswordSchema,
  emailVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  instructorSignUpSchema,
  assistantSignUpSchema,
} from '../../../validations/auth.validation.js';

export const mgmtAuthRouter = Router();

/** 강사 회원가입 */
mgmtAuthRouter.post(
  '/instructor/signup',
  validate(instructorSignUpSchema),
  container.authController.instructorSignUp.bind(container.authController),
);

/** 조교 회원가입 */
mgmtAuthRouter.post(
  '/assistant/signup',
  validate(assistantSignUpSchema),
  container.authController.assistantSignUp.bind(container.authController),
);

/** 강사/조교 로그인 */
mgmtAuthRouter.post(
  '/signin',
  validate(signInSchema),
  container.authController.signIn.bind(container.authController),
);

/** 이메일 인증코드 발송/검증 */
mgmtAuthRouter.post(
  '/email-verification',
  validate(emailVerificationSchema),
  container.authController.emailVerification.bind(container.authController),
);

/** 이메일 기반 비밀번호 찾기 요청 */
mgmtAuthRouter.post(
  '/find-password',
  validate(findPasswordSchema),
  container.authController.findPassword.bind(container.authController),
);

/** 비밀번호 재설정(OTP) */
mgmtAuthRouter.post(
  '/reset-password',
  validate(resetPasswordSchema),
  container.authController.resetPassword.bind(container.authController),
);

/** 강사/조교 로그아웃 */
mgmtAuthRouter.post(
  '/signout',
  container.authController.signOut.bind(container.authController),
);

/** 강사/조교 세션 조회 */
mgmtAuthRouter.get(
  '/session',
  container.authController.getSession.bind(container.authController),
);
