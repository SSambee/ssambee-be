import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createLectureSchema,
  getLecturesQuerySchema,
  lectureParamSchema,
  lectureIdParamSchema,
  updateLectureSchema,
} from '../../../validations/lectures.validation.js';
import { createEnrollmentSchema } from '../../../validations/enrollments.validation.js';
import { createBulkAttendancesSchema } from '../../../validations/attendances.validation.js';
import {
  createExamSchema,
  lectureIdExamParamSchema,
} from '../../../validations/exams.validation.js';

export const mgmtLecturesRouter = Router();

const {
  requireAuth,
  requireInstructor,
  requireInstructorOrAssistant,
  lecturesController,
} = container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtLecturesRouter.use(requireAuth);
mgmtLecturesRouter.use(requireInstructorOrAssistant);

/** 강의 리스트 조회 */
mgmtLecturesRouter.get(
  '/',
  validate(getLecturesQuerySchema, 'query'),
  lecturesController.getLectures,
);

/** 강의 개별 조회 */
mgmtLecturesRouter.get(
  '/:id',
  validate(lectureParamSchema, 'params'),
  lecturesController.getLecture,
);

/** 강의 생성 */
mgmtLecturesRouter.post(
  '/',
  validate(createLectureSchema, 'body'),
  lecturesController.createLecture,
);

/** 강의 수정 */
mgmtLecturesRouter.patch(
  '/:id',
  validate(lectureParamSchema, 'params'),
  validate(updateLectureSchema, 'body'),
  lecturesController.updateLecture,
);

/** 강의 삭제 (Soft Delete) */
mgmtLecturesRouter.delete(
  '/:id',
  requireInstructor,
  validate(lectureParamSchema, 'params'),
  lecturesController.deleteLecture,
);

/** 강의별 시험 목록 조회 (questions 제외) */
mgmtLecturesRouter.get(
  '/:lectureId/exams',
  validate(lectureIdExamParamSchema, 'params'),
  container.examsController.getExamsByLecture,
);

/** 시험 생성 */
mgmtLecturesRouter.post(
  '/:lectureId/exams',
  validate(lectureIdParamSchema, 'params'),
  validate(createExamSchema, 'body'),
  container.examsController.createExam,
);

/** --- 수강생 (Nested Routes) --- */

/** 해당 강의에 수강생 등록 */
mgmtLecturesRouter.post(
  '/:lectureId/enrollments',
  validate(createEnrollmentSchema, 'body'),
  container.enrollmentsController.createEnrollment,
);

/** 해당 강의 수강생 단체 출결 등록 */
mgmtLecturesRouter.post(
  '/:lectureId/enrollments/attendances',
  validate(createBulkAttendancesSchema, 'body'),
  container.attendancesController.createBulkAttendances,
);
