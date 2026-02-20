import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { createPublicAuthRoutes } from '../../public/v1/auth.routes.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
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

mgmtAuthRouter.use(
  '/',
  createPublicAuthRoutes({
    verifyEmailHandler: container.authController.verifyEmailForMgmt.bind(
      container.authController,
    ),
  }),
);
