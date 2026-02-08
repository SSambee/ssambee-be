import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { getAssistantsQuerySchema } from '../../../validations/assistants.validation.js';

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
