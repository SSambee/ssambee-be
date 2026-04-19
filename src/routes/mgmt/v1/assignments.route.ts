import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssignmentSchema,
  getAssignmentsQuerySchema,
  assignmentIdParamSchema,
  updateAssignmentSchema,
  lectureIdParamSchema,
} from '../../../validations/assignments.validation.js';

export const mgmtAssignmentsRouter = Router({ mergeParams: true });

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtAssignmentsRouter.use(container.requireAuth);
mgmtAssignmentsRouter.use(container.requireInstructorOrAssistant);
mgmtAssignmentsRouter.use(container.requireActiveInstructorEntitlement);

/**
 * 과제 생성
 * POST /api/mgmt/v1/lectures/:lectureId/assignments
 */
mgmtAssignmentsRouter.post(
  '/',
  validate(lectureIdParamSchema, 'params'),
  validate(createAssignmentSchema, 'body'),
  container.assignmentsController.createAssignment,
);

/**
 * 과제 목록 조회
 * GET /api/mgmt/v1/assignments
 */
mgmtAssignmentsRouter.get(
  '/',
  validate(getAssignmentsQuerySchema, 'query'),
  container.assignmentsController.getAssignments,
);

/**
 * 과제 단일 조회
 * GET /api/mgmt/v1/assignments/:assignmentId
 */
mgmtAssignmentsRouter.get(
  '/:assignmentId',
  validate(assignmentIdParamSchema, 'params'),
  container.assignmentsController.getAssignmentById,
);

/**
 * 과제 수정
 * PATCH /api/mgmt/v1/assignments/:assignmentId
 */
mgmtAssignmentsRouter.patch(
  '/:assignmentId',
  validate(assignmentIdParamSchema, 'params'),
  validate(updateAssignmentSchema, 'body'),
  container.assignmentsController.updateAssignment,
);

/**
 * 과제 삭제
 * DELETE /api/mgmt/v1/assignments/:assignmentId
 */
mgmtAssignmentsRouter.delete(
  '/:assignmentId',
  validate(assignmentIdParamSchema, 'params'),
  container.assignmentsController.deleteAssignment,
);

/**
 * 과제 결과 생성
 * POST /api/mgmt/v1/assignments/:assignmentId/result
 */
import { createAssignmentResultSchema } from '../../../validations/assignment-results.validation.js';

mgmtAssignmentsRouter.post(
  '/:assignmentId/result',
  validate(assignmentIdParamSchema, 'params'),
  validate(createAssignmentResultSchema, 'body'),
  container.assignmentResultsController.createResult,
);
