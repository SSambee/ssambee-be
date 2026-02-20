import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { createPublicAuthRoutes } from '../../public/v1/auth.routes.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
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

svcAuthRouter.use(
  '/',
  createPublicAuthRoutes({
    verifyEmailHandler: container.authController.verifyEmailForSvc.bind(
      container.authController,
    ),
  }),
);
