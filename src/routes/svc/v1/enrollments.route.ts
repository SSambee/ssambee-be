import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  lectureEnrollmentIdParamSchema,
  getSvcEnrollmentsQuerySchema,
} from '../../../validations/enrollments.validation.js';

export const svcLecturesRouter = Router();

const { requireAuth, requireStudent, enrollmentsController } = container;

/** ---------- 로그인한 사용자 ---------- */
svcLecturesRouter.use(requireAuth);
svcLecturesRouter.use(requireStudent);

/** 수강 강의 목록 조회 */
svcLecturesRouter.get(
  '/',
  validate(getSvcEnrollmentsQuerySchema, 'query'),
  enrollmentsController.getEnrollments,
);

/** 수강 강의 상세 조회 */
svcLecturesRouter.get(
  '/:lectureEnrollmentId',
  validate(lectureEnrollmentIdParamSchema, 'params'),
  enrollmentsController.getEnrollment,
);
