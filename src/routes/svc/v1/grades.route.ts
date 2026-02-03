import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { gradeIdParamSchema } from '../../../validations/grades.validation.js';

export const svcGradesRouter = Router();

const { requireAuth, requireStudent, gradesController } = container;

/** ---------- 로그인한 학생 ---------- */
svcGradesRouter.use(requireAuth);
svcGradesRouter.use(requireStudent);

/** 성적 상세 조회 */
svcGradesRouter.get(
  '/:gradeId',
  validate(gradeIdParamSchema, 'params'),
  gradesController.getGradeDetail,
);
