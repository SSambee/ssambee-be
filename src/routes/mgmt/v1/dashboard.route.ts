import { Router } from 'express';
import { container } from '../../../config/container.config.js';

export const mgmtDashboardRouter = Router();

/** 공통 미들웨어: 인증 필요, 강사/조교만 접근 */
mgmtDashboardRouter.use(container.requireAuth);
mgmtDashboardRouter.use(container.requireInstructorOrAssistant);

/**
 * 대시보드 조회
 * GET /api/mgmt/v1/dashboard
 */
mgmtDashboardRouter.get('/', container.dashboardController.getDashboard);
