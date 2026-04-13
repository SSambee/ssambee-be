import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { validate } from '../../../middlewares/validate.middleware.js';
import {
  createAssignmentCategorySchema,
  updateAssignmentCategorySchema,
  assignmentCategoryIdParamSchema,
} from '../../../validations/assignment-categories.validation.js';

export const mgmtAssignmentCategoriesRouter = Router();

// 공통 미들웨어: 인증 필요, 강사 또는 조교만 접근 가능
mgmtAssignmentCategoriesRouter.use(container.requireAuth);
mgmtAssignmentCategoriesRouter.use(container.requireInstructorOrAssistant);
mgmtAssignmentCategoriesRouter.use(
  container.requireActiveInstructorEntitlement,
);

/** 카테고리 목록 조회 */
mgmtAssignmentCategoriesRouter.get(
  '/',
  container.assignmentCategoryController.getCategories,
);

/** 카테고리 생성 */
mgmtAssignmentCategoriesRouter.post(
  '/',
  validate(createAssignmentCategorySchema, 'body'),
  container.assignmentCategoryController.createCategory,
);

/** 카테고리 단일 조회 */
mgmtAssignmentCategoriesRouter.get(
  '/:id',
  validate(assignmentCategoryIdParamSchema, 'params'),
  container.assignmentCategoryController.getCategoryById,
);

/** 카테고리 수정 */
mgmtAssignmentCategoriesRouter.patch(
  '/:id',
  validate(assignmentCategoryIdParamSchema, 'params'),
  validate(updateAssignmentCategorySchema, 'body'),
  container.assignmentCategoryController.updateCategory,
);

/** 카테고리 삭제 */
mgmtAssignmentCategoriesRouter.delete(
  '/:id',
  validate(assignmentCategoryIdParamSchema, 'params'),
  container.assignmentCategoryController.deleteCategory,
);
