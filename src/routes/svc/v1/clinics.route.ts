import { Router } from 'express';
import { container } from '../../../config/container.config.js';

export const svcClinicsRouter = Router();

const { requireAuth, requireStudent, clinicsController } = container;

/** ---------- 로그인한 학생 ---------- */
svcClinicsRouter.use(requireAuth);
svcClinicsRouter.use(requireStudent);

/** 내 클리닉 목록 조회 */
svcClinicsRouter.get('/', clinicsController.getClinicsByStudent);
