import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import { materialParamsSchema } from '../../../validations/materials.validation.js';

export const svcMaterialsRouter = Router();

const {
  materialsController,
  requireAuth,
  requireStudent, // 학생 전용? 학부모도 포함되어야 하는데...
  // 통합 미들웨어 requireStudentOrParent 추가 예정
} = container;

svcMaterialsRouter.use(requireAuth);
svcMaterialsRouter.use(requireStudent);

/** 자료 상세 조회 (GET /api/svc/v1/materials/:materialsId) */
svcMaterialsRouter.get(
  '/:materialsId',
  validate(materialParamsSchema, 'params'),
  materialsController.getMaterialDetail,
);

/** 다운로드 URL (GET /api/svc/v1/materials/:materialsId/download) */
svcMaterialsRouter.get(
  '/:materialsId/download',
  validate(materialParamsSchema, 'params'),
  materialsController.getDownloadUrl,
);
