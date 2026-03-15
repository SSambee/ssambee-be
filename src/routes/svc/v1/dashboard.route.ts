import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { getDashboardQuerySchema } from '../../../validations/dashboard.validation.js';

export const svcDashboardRouter = Router();

const { requireAuth, requireStudentOrParent, dashboardController } = container;

/** ---------- 로그인한 사용자 (학생 또는 학부모) ---------- */
svcDashboardRouter.use(requireAuth);
svcDashboardRouter.use(requireStudentOrParent);

/** 대시보드 조회 */
svcDashboardRouter.get(
  '/',
  validate(getDashboardQuerySchema, 'query'),
  dashboardController.getSvcDashboard,
);
