import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createScheduleCategorySchema,
  updateScheduleCategorySchema,
  scheduleCategoryIdParamSchema,
} from '../../../validations/schedule-categories.validation.js';

export const mgmtScheduleCategoriesRouter = Router();

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtScheduleCategoriesRouter.use(container.requireAuth);
mgmtScheduleCategoriesRouter.use(container.requireInstructorOrAssistant);

/** 카테고리 목록 조회 */
mgmtScheduleCategoriesRouter.get(
  '/',
  container.scheduleCategoryController.getCategories,
);

/** 카테고리 생성 */
mgmtScheduleCategoriesRouter.post(
  '/',
  validate(createScheduleCategorySchema, 'body'),
  container.scheduleCategoryController.createCategory,
);

/** 카테고리 수정 */
mgmtScheduleCategoriesRouter.patch(
  '/:id',
  validate(scheduleCategoryIdParamSchema, 'params'),
  validate(updateScheduleCategorySchema, 'body'),
  container.scheduleCategoryController.updateCategory,
);

/** 카테고리 삭제 */
mgmtScheduleCategoriesRouter.delete(
  '/:id',
  validate(scheduleCategoryIdParamSchema, 'params'),
  container.scheduleCategoryController.deleteCategory,
);
