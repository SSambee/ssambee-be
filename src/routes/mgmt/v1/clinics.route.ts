import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  getClinicsQuerySchema,
  updateClinicsSchema,
} from '../../../validations/clinics.validation.js';

export const mgmtClinicsRouter = Router();

const { requireAuth, requireInstructorOrAssistant, clinicsController } =
  container;

/** 모든 라우트에 대해 강사/조교 권한 필요 */
mgmtClinicsRouter.use(requireAuth);
mgmtClinicsRouter.use(requireInstructorOrAssistant);

/**
 * 클리닉 목록 조회
 * GET /api/mgmt/v1/clinics
 */
mgmtClinicsRouter.get(
  '/',
  validate(getClinicsQuerySchema, 'query'),
  clinicsController.getClinics,
);

/**
 * 다중 클리닉 수정
 * PATCH /api/mgmt/v1/clinics
 */
mgmtClinicsRouter.patch(
  '/',
  validate(updateClinicsSchema, 'body'),
  clinicsController.updateClinics,
);
