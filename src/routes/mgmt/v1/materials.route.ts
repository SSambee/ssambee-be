import { Router } from 'express';
import { upload } from '../../../middlewares/multer.middleware.js';

import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  uploadMaterialSchema,
  updateMaterialSchema,
  getMaterialsQuerySchema,
  materialParamsSchema,
} from '../../../validations/materials.validation.js';

export const mgmtMaterialsRouter = Router();

const {
  materialsController,
  requireAuth,
  requireInstructorOrAssistant, // 강사/조교 전용
} = container;

mgmtMaterialsRouter.use(requireAuth);
mgmtMaterialsRouter.use(requireInstructorOrAssistant);

/** 자료 업로드 */
mgmtMaterialsRouter.post(
  '/',
  upload.single('file'), // 'file' 필드
  validate(uploadMaterialSchema, 'body'),
  materialsController.uploadMaterial,
);

/** 자료 목록 조회 */
mgmtMaterialsRouter.get(
  '/',
  validate(getMaterialsQuerySchema, 'query'),
  materialsController.getMaterials,
);

/** 자료 상세 조회 */
mgmtMaterialsRouter.get(
  '/:materialsId',
  validate(materialParamsSchema, 'params'),
  materialsController.getMaterialDetail,
);

/** 자료 수정 */
mgmtMaterialsRouter.patch(
  '/:materialsId',
  validate(materialParamsSchema, 'params'),
  validate(updateMaterialSchema, 'body'),
  materialsController.updateMaterial,
);

/** 자료 삭제 (DELETE /api/mgmt/v1/materials/:materialId) */
mgmtMaterialsRouter.delete(
  '/:materialsId',
  validate(materialParamsSchema, 'params'),
  materialsController.deleteMaterial,
);

/** 다운로드 URL 획득 */
mgmtMaterialsRouter.get(
  '/:materialsId/download',
  validate(materialParamsSchema, 'params'),
  materialsController.getDownloadUrl,
);
