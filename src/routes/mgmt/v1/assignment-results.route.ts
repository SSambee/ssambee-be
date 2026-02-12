import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssignmentResultSchema,
  updateAssignmentResultSchema,
  assignmentResultParamsSchema,
} from '../../../validations/assignment-results.validation.js';

export const mgmtAssignmentResultsRouter = Router({ mergeParams: true });

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtAssignmentResultsRouter.use(container.requireAuth);
mgmtAssignmentResultsRouter.use(container.requireInstructorOrAssistant);

/**
 * 과제 결과 생성
 * POST /api/mgmt/v1/assignments/:assignmentId/lecture-enrollments/:lectureEnrollmentId
 */
mgmtAssignmentResultsRouter.post(
  '/',
  validate(assignmentResultParamsSchema, 'params'),
  validate(createAssignmentResultSchema, 'body'),
  container.assignmentResultsController.createResult,
);

/**
 * 과제 결과 조회
 * GET /api/mgmt/v1/assignments/:assignmentId/lecture-enrollments/:lectureEnrollmentId
 */
mgmtAssignmentResultsRouter.get(
  '/',
  validate(assignmentResultParamsSchema, 'params'),
  container.assignmentResultsController.getResult,
);

/**
 * 과제 결과 수정
 * PATCH /api/mgmt/v1/assignments/:assignmentId/lecture-enrollments/:lectureEnrollmentId
 */
mgmtAssignmentResultsRouter.patch(
  '/',
  validate(assignmentResultParamsSchema, 'params'),
  validate(updateAssignmentResultSchema, 'body'),
  container.assignmentResultsController.updateResult,
);

/**
 * 과제 결과 삭제
 * DELETE /api/mgmt/v1/assignments/:assignmentId/lecture-enrollments/:lectureEnrollmentId
 */
mgmtAssignmentResultsRouter.delete(
  '/',
  validate(assignmentResultParamsSchema, 'params'),
  container.assignmentResultsController.deleteResult,
);
