import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { inviteAdminSchema } from '../../../validations/admins.validation.js';

export const adminsRouter = Router();

const { requireAuth, requireAdmin, adminsController } = container;

adminsRouter.use(requireAuth);
adminsRouter.use(requireAdmin);

adminsRouter.post(
  '/invitations',
  validate(inviteAdminSchema),
  adminsController.inviteAdmin,
);
