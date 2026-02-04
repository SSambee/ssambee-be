import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  examIdParamSchema,
  examAndEnrollmentParamSchema,
  updateExamSchema,
} from '../../../validations/exams.validation.js';
import { submitGradingSchema } from '../../../validations/grades.validation.js';
import { createClinicsSchema } from '../../../validations/clinics.validation.js';

export const mgmtExamsRouter = Router();

const { requireAuth, requireInstructorOrAssistant, examsController } =
  container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtExamsRouter.use(requireAuth);
mgmtExamsRouter.use(requireInstructorOrAssistant);

/** 강사별 전체 시험 목록 조회 */
mgmtExamsRouter.get('/', examsController.getExams);

/** 시험 상세 조회 (questions 포함) */
mgmtExamsRouter.get(
  '/:examId',
  validate(examIdParamSchema, 'params'),
  examsController.getExam,
);

/** 시험 수정 (문항 Upsert 포함) */
mgmtExamsRouter.patch(
  '/:examId',
  validate(examIdParamSchema, 'params'),
  validate(updateExamSchema, 'body'),
  examsController.updateExam,
);

/** 시험 삭제 (PENDING 상태일 때만 가능) */
mgmtExamsRouter.delete(
  '/:examId',
  validate(examIdParamSchema, 'params'),
  examsController.deleteExam,
);

/** 채점 제출 (학생 답안 채점 및 Upsert) */
mgmtExamsRouter.post(
  '/:examId/grades',
  validate(examIdParamSchema, 'params'),
  validate(submitGradingSchema, 'body'),
  (req, res, next) => container.gradesController.submitGrading(req, res, next),
);

/** 성적 조회 */
mgmtExamsRouter.get(
  '/:examId/grades',
  validate(examIdParamSchema, 'params'),
  (req, res, next) =>
    container.gradesController.getGradesByExam(req, res, next),
);

/** 수강생별 성적/답안 상세 조회 */
mgmtExamsRouter.get(
  '/:examId/grades/lectureEnrollments/:lectureEnrollmentId',
  validate(examAndEnrollmentParamSchema, 'params'),
  (req, res, next) =>
    container.gradesController.getStudentGradeWithAnswers(req, res, next),
);

/** 통계 산출 및 저장 */
mgmtExamsRouter.post(
  '/:examId/statistics',
  validate(examIdParamSchema, 'params'),
  (req, res, next) =>
    container.statisticsController.calculateStatistics(req, res, next),
);

/** 캐싱된 통계 조회 */
mgmtExamsRouter.get(
  '/:examId/statistics',
  validate(examIdParamSchema, 'params'),
  (req, res, next) =>
    container.statisticsController.getStatistics(req, res, next),
);

/** 채점 완료 처리 및 클리닉 생성 */
mgmtExamsRouter.post(
  '/:examId/grades/complete',
  validate(examIdParamSchema, 'params'),
  validate(createClinicsSchema, 'body'),
  (req, res, next) =>
    container.clinicsController.completeGrading(req, res, next),
);
