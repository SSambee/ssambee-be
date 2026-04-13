import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssistantOrderSchema,
  getAssistantOrdersQuerySchema,
  updateAssistantOrderSchema,
  updateAssistantOrderStatusSchema,
  assistantOrderIdParamSchema,
} from '../../../validations/assistant-order.validation.js';
import { UserType } from '../../../constants/auth.constant.js';
import { getAuthUser } from '../../../utils/user.util.js';

export const mgmtAssistantOrderRouter = Router({ mergeParams: true });

const {
  requireAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  assistantOrderController,
} = container;

mgmtAssistantOrderRouter.use(requireAuth);
mgmtAssistantOrderRouter.use(requireInstructorOrAssistant);
mgmtAssistantOrderRouter.use(container.requireActiveInstructorEntitlement);

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
  validate(assistantOrderIdParamSchema, 'params'),
  assistantOrderController.getOrderById,
);

/**
 * PATCH /api/mgmt/v1/assistant-order/:id
 * 지시 수정 (강사: 전체, 조교: 상태만)
 */
mgmtAssistantOrderRouter.patch(
  '/:id',
  (req, res, next) => {
    const user = getAuthUser(req);
    const schema =
      user.userType === UserType.INSTRUCTOR
        ? updateAssistantOrderSchema
        : updateAssistantOrderStatusSchema;

    validate(schema, 'body')(req, res, next);
  },
  validate(assistantOrderIdParamSchema, 'params'),
  assistantOrderController.updateOrder,
);

/**
 * DELETE /api/mgmt/v1/assistant-order/:id
 * 지시 삭제 (강사 전용)
 */
mgmtAssistantOrderRouter.delete(
  '/:id',
  requireInstructor,
  validate(assistantOrderIdParamSchema, 'params'),
  assistantOrderController.deleteOrder,
);
