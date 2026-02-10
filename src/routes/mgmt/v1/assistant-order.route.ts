import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssistantOrderSchema,
  getAssistantOrdersQuerySchema,
  getAssistantOrderByIdSchema,
} from '../../../validations/assistant-order.validation.js';

export const mgmtAssistantOrderRouter = Router({ mergeParams: true });

const {
  requireAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  assistantOrderController,
} = container;

mgmtAssistantOrderRouter.use(requireAuth);
mgmtAssistantOrderRouter.use(requireInstructorOrAssistant);

/**
 * POST /api/mgmt/v1/assistant-order
 * 지시 생성
 */
mgmtAssistantOrderRouter.post(
  '/',
  requireInstructor,
  validate(createAssistantOrderSchema, 'body'),
  assistantOrderController.createOrder,
);

/**
 * GET /api/mgmt/v1/assistant-order
 * 지시 목록 조회
 */
mgmtAssistantOrderRouter.get(
  '/',
  validate(getAssistantOrdersQuerySchema, 'query'),
  assistantOrderController.getOrders,
);

/**
 * GET /api/mgmt/v1/assistant-order/:id
 * 지시 개별 조회
 */
mgmtAssistantOrderRouter.get(
  '/:id',
  validate(getAssistantOrderByIdSchema, 'params'),
  assistantOrderController.getOrderById,
);
