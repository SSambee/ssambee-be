import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { lectureEnrollmentIdParamSchema } from '../../../validations/lecture-enrollments.validation.js';

export const mgmtLectureEnrollmentsRouter = Router();

const {
  requireAuth,
  requireInstructorOrAssistant,
  lectureEnrollmentsController,
} = container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtLectureEnrollmentsRouter.use(requireAuth);
mgmtLectureEnrollmentsRouter.use(requireInstructorOrAssistant);

/** 강의수강생 상세 조회 (성적 포함) */
mgmtLectureEnrollmentsRouter.get(
  '/:lectureEnrollmentId',
  validate(lectureEnrollmentIdParamSchema, 'params'),
  lectureEnrollmentsController.getLectureEnrollmentDetail,
);
