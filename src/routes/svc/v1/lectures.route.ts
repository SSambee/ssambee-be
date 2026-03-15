import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { lectureEnrollmentIdParamSchema } from '../../../validations/enrollments.validation.js';

export const svcLecturesRouter = Router();

const { requireAuth, requireStudent, enrollmentsController, gradesController } =
  container;

svcLecturesRouter.use(requireAuth);
svcLecturesRouter.use(requireStudent);

/** 수강 강의 상세 조회 */
svcLecturesRouter.get(
  '/:lectureEnrollmentId',
  validate(lectureEnrollmentIdParamSchema, 'params'),
  enrollmentsController.getEnrollment,
);

/** 수강별 성적 목록 조회 */
svcLecturesRouter.get(
  '/:lectureEnrollmentId/grades',
  validate(lectureEnrollmentIdParamSchema, 'params'),
  gradesController.getGradesByEnrollment,
);
