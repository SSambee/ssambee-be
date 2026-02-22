import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  enrollmentIdParamSchema,
  getSvcEnrollmentsQuerySchema,
} from '../../../validations/enrollments.validation.js';

export const svcEnrollmentsRouter = Router();

const { requireAuth, requireStudent, enrollmentsController } = container;

/** ---------- 로그인한 사용자 ---------- */
svcEnrollmentsRouter.use(requireAuth);
svcEnrollmentsRouter.use(requireStudent);

/** 강사 목록 조회 (구 수강 강의 목록) */
svcEnrollmentsRouter.get(
  '/',
  validate(getSvcEnrollmentsQuerySchema, 'query'),
  enrollmentsController.getEnrollments,
);

/** 강사별 수강 강의 목록 조회 */
svcEnrollmentsRouter.get(
  '/:enrollmentId',
  validate(enrollmentIdParamSchema, 'params'),
  enrollmentsController.getEnrollmentLectures,
);
