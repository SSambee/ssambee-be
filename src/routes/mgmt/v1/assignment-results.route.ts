import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  updateAssignmentResultSchema,
  assignmentResultIdParamSchema,
  upsertAssignmentResultsSchema,
} from '../../../validations/assignment-results.validation.js';

export const mgmtAssignmentResultsRouter = Router({ mergeParams: true });

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtAssignmentResultsRouter.use(container.requireAuth);
mgmtAssignmentResultsRouter.use(container.requireInstructorOrAssistant);

/**
 * 과제 결과 단체 등록/수정/삭제 (resultIndex null이면 삭제)
 * PUT /api/mgmt/v1/assignment-results
 */
mgmtAssignmentResultsRouter.put(
  '/',
  validate(upsertAssignmentResultsSchema, 'body'),
  container.assignmentResultsController.upsertBulkResults,
);

/**
 * 과제 결과 조회
 * GET /api/mgmt/v1/assignment-results/:resultId
 */
mgmtAssignmentResultsRouter.get(
  '/:resultId',
  validate(assignmentResultIdParamSchema, 'params'),
  container.assignmentResultsController.getResult,
);

/**
 * 과제 결과 수정
 * PATCH /api/mgmt/v1/assignment-results/:resultId
 */
mgmtAssignmentResultsRouter.patch(
  '/:resultId',
  validate(assignmentResultIdParamSchema, 'params'),
  validate(updateAssignmentResultSchema, 'body'),
  container.assignmentResultsController.updateResult,
);

/**
 * 과제 결과 삭제
 * DELETE /api/mgmt/v1/assignment-results/:resultId
 */
mgmtAssignmentResultsRouter.delete(
  '/:resultId',
  validate(assignmentResultIdParamSchema, 'params'),
  container.assignmentResultsController.deleteResult,
);
