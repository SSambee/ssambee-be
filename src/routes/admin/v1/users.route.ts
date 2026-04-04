import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { getAdminUsersQuerySchema } from '../../../validations/admin-users.validation.js';

export const adminUsersRouter = Router();

const { requireAuth, requireAdmin, adminUsersController } = container;

adminUsersRouter.use(requireAuth);
adminUsersRouter.use(requireAdmin);

adminUsersRouter.get(
  '/',
  validate(getAdminUsersQuerySchema, 'query'),
  adminUsersController.getUsers,
);
adminUsersRouter.get('/stats', adminUsersController.getUserStats);
