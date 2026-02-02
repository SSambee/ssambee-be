import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  enrollmentIdParamSchema,
  getSvcEnrollmentsQuerySchema,
} from '../../../validations/enrollments.validation.js';

export const svcEnrollmentsRouter = Router();

const { requireAuth, requireStudent, enrollmentsController, gradesController } =
  container;

/** ---------- 로그인한 사용자 ---------- */
svcEnrollmentsRouter.use(requireAuth);
svcEnrollmentsRouter.use(requireStudent);

/** 수강 목록 조회 */
svcEnrollmentsRouter.get(
  '/',
  validate(getSvcEnrollmentsQuerySchema, 'query'),
  enrollmentsController.getEnrollments,
);

/** 수강별 성적 목록 조회 */
svcEnrollmentsRouter.get(
  '/:enrollmentId/grades',
  validate(enrollmentIdParamSchema, 'params'),
  gradesController.getGradesByEnrollment,
);

/** 수강 상세 조회 */
svcEnrollmentsRouter.get(
  '/:enrollmentId',
  validate(enrollmentIdParamSchema, 'params'),
  enrollmentsController.getEnrollment,
);
