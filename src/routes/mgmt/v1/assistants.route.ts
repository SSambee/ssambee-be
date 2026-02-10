import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  getAssistantsQuerySchema,
  updateAssistantBodySchema,
  updateAssistantParamsSchema,
  updateAssistantQuerySchema,
} from '../../../validations/assistants.validation.js';

export const mgmtAssistantsRouter = Router({ mergeParams: true });

const { requireAuth, requireInstructor, assistantsController } = container;

mgmtAssistantsRouter.use(requireAuth);
mgmtAssistantsRouter.use(requireInstructor);

/**
 * GET /api/mgmt/v1/assistants
 * 조교 목록 조회
 */
mgmtAssistantsRouter.get(
  '/',
  validate(getAssistantsQuerySchema, 'query'),
  assistantsController.getAssistants,
);

/**
 * PATCH /api/mgmt/v1/assistants/:id
 * 조교 정보 수정 / 가입 승인 / 가입 거부 / 탈퇴 처리
 */
mgmtAssistantsRouter.patch(
  '/:id',
  validate(updateAssistantParamsSchema, 'params'),
  validate(updateAssistantBodySchema, 'body'),
  validate(updateAssistantQuerySchema, 'query'),
  assistantsController.updateAssistant,
);
