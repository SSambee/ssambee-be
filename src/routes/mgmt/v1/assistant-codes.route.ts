import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssistantCodeSchema,
  validateAssistantCodeSchema,
} from '../../../validations/assistant-codes.validation.js';

export const mgmtAssistantCodesRouter = Router();

/** 조교 가입 코드 검증 (비로그인 접근 가능) */
mgmtAssistantCodesRouter.get(
  '/validate',
  validate(validateAssistantCodeSchema, 'query'),
  container.assistantCodesController.validateCode,
);

// 공통 미들웨어: 인증 필요, 강사만 접근 가능
mgmtAssistantCodesRouter.use(container.requireAuth);
mgmtAssistantCodesRouter.use(container.requireInstructor);

/** 조교 가입 코드 생성 */
mgmtAssistantCodesRouter.post(
  '/',
  validate(createAssistantCodeSchema),
  container.assistantCodesController.createCode,
);

/** 조교 가입 코드 목록 조회 */
mgmtAssistantCodesRouter.get(
  '/',
  container.assistantCodesController.getCodesList,
);
