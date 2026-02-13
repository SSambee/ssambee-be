import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  gradeIdParamSchema,
  gradeReportDescriptionSchema,
} from '../../../validations/grades.validation.js';
import { upload } from '../../../middlewares/multer.middleware.js';

export const mgmtGradesRouter = Router();

const { requireAuth, requireInstructorOrAssistant, gradesController } =
  container;

mgmtGradesRouter.use(requireAuth);
mgmtGradesRouter.use(requireInstructorOrAssistant);

/**
 * 성적 상세 조회 (답안 포함)
 * GET /api/mgmt/v1/grades/:gradeId
 */
mgmtGradesRouter.get(
  '/:gradeId',
  validate(gradeIdParamSchema, 'params'),
  gradesController.getGradeDetailForInstructor,
);

/**
 * 성적표 리포트 조회
 * GET /api/mgmt/v1/grades/:gradeId/report
 */
mgmtGradesRouter.get(
  '/:gradeId/report',
  validate(gradeIdParamSchema, 'params'),
  gradesController.getGradeReport,
);

/**
 * 성적표 리포트 설명 업데이트
 * POST /api/mgmt/v1/grades/:gradeId/report/description
 */
mgmtGradesRouter.post(
  '/:gradeId/report/description',
  validate(gradeIdParamSchema, 'params'),
  validate(gradeReportDescriptionSchema, 'body'),
  gradesController.updateGradeReportDescription,
);

/**
 * 성적표 리포트 파일 업로드
 * POST /api/mgmt/v1/grades/:gradeId/report/file-upload
 */
mgmtGradesRouter.post(
  '/:gradeId/report/file-upload',
  validate(gradeIdParamSchema, 'params'),
  upload.single('file'),
  gradesController.uploadGradeReportFile,
);

/**
 * 성적표 리포트 파일 다운로드 URL 조회
 * GET /api/mgmt/v1/grades/:gradeId/report/file-download
 */
mgmtGradesRouter.get(
  '/:gradeId/report/file-download',
  validate(gradeIdParamSchema, 'params'),
  gradesController.getGradeReportFileDownload,
);
