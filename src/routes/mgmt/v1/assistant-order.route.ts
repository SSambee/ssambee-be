import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { createAssistantOrderSchema } from '../../../validations/assistant-order.validation.js';

export const mgmtAssistantOrderRouter = Router({ mergeParams: true });

const { requireAuth, requireInstructor, assistantOrderController } = container;

mgmtAssistantOrderRouter.use(requireAuth);
mgmtAssistantOrderRouter.use(requireInstructor);

/**
 * POST /api/mgmt/v1/assistant-order
 * 지시 생성
 */
mgmtAssistantOrderRouter.post(
  '/',
  validate(createAssistantOrderSchema, 'body'),
  assistantOrderController.createOrder,
);
