import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { adminSignInSchema } from '../../../validations/auth.validation.js';

export const adminAuthRouter = Router();

const { authController, requireAuth, requireAdmin } = container;

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
