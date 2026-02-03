import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  enrollmentIdParamSchema,
  updateEnrollmentSchema,
  getEnrollmentsQuerySchema,
} from '../../../validations/enrollments.validation.js';

export const mgmtEnrollmentsRouter = Router({ mergeParams: true });

const { requireAuth, requireInstructorOrAssistant, enrollmentsController } =
  container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtEnrollmentsRouter.use(requireAuth);
mgmtEnrollmentsRouter.use(requireInstructorOrAssistant);

/** 강사: 본인의 강의를 수강하는 모든 학생 목록 조회 */
mgmtEnrollmentsRouter.get(
  '/',
  validate(getEnrollmentsQuerySchema, 'query'),
  enrollmentsController.getEnrollments,
);

/** 수강 정보 상세 조회 */
mgmtEnrollmentsRouter.get(
  '/:enrollmentId',
  validate(enrollmentIdParamSchema, 'params'),
  enrollmentsController.getEnrollment,
);

/** 수강 정보 수정 */
mgmtEnrollmentsRouter.patch(
  '/:enrollmentId',
  validate(updateEnrollmentSchema, 'body'),
  enrollmentsController.updateEnrollment,
);
