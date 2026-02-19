import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  findPasswordSchema,
  emailVerificationSchema,
  resetPasswordSchema,
  signInSchema,
  studentSignUpSchema,
  parentSignUpSchema,
} from '../../../validations/auth.validation.js';

export const svcAuthRouter = Router();

/** 학생 회원가입 */
svcAuthRouter.post(
  '/student/signup',
  validate(studentSignUpSchema),
  container.authController.studentSignUp.bind(container.authController),
);

/** 학부모 회원가입 */
svcAuthRouter.post(
  '/parent/signup',
  validate(parentSignUpSchema),
  container.authController.parentSignUp.bind(container.authController),
);

/** 학생/학부모 로그인 */
svcAuthRouter.post(
  '/signin',
  validate(signInSchema),
  container.authController.signIn.bind(container.authController),
);

/** 이메일 인증코드 발송/검증 */
svcAuthRouter.post(
  '/email-verification',
  validate(emailVerificationSchema),
  container.authController.emailVerification.bind(container.authController),
);

/** 이메일 기반 비밀번호 찾기 요청 */
svcAuthRouter.post(
  '/find-password',
  validate(findPasswordSchema),
  container.authController.findPassword.bind(container.authController),
);

/** 비밀번호 재설정(OTP) */
svcAuthRouter.post(
  '/reset-password',
  validate(resetPasswordSchema),
  container.authController.resetPassword.bind(container.authController),
);

/** 학생/학부모 로그아웃 */
svcAuthRouter.post(
  '/signout',
  container.authController.signOut.bind(container.authController),
);

/** 학생/학부모 세션 조회 */
svcAuthRouter.get(
  '/session',
  container.authController.getSession.bind(container.authController),
);
