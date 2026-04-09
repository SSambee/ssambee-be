import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  adminActivationCompleteSchema,
  adminActivationRequestSchema,
  adminActivationVerifySchema,
  adminSignInSchema,
} from '../../../validations/auth.validation.js';

export const adminAuthRouter = Router();

const { authController, requireAuth, requireAdmin } = container;

adminAuthRouter.post(
  '/activate/request-otp',
  validate(adminActivationRequestSchema),
  authController.adminRequestActivationOtp,
);

adminAuthRouter.post(
  '/activate/verify-otp',
  validate(adminActivationVerifySchema),
  authController.adminVerifyActivationOtp,
);

adminAuthRouter.post(
  '/activate/complete',
  requireAuth,
  validate(adminActivationCompleteSchema),
  authController.adminCompleteActivation,
);

adminAuthRouter.post(
  '/signin',
  validate(adminSignInSchema),
  authController.adminSignIn,
);

adminAuthRouter.get(
  '/session',
  requireAuth,
  requireAdmin,
  authController.getAdminSession,
);
adminAuthRouter.post(
  '/signout',
  requireAuth,
  requireAdmin,
  authController.signOut,
);
