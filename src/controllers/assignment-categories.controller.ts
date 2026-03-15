import { Request, Response, NextFunction } from 'express';
import { AssignmentCategoryService } from '../services/assignment-categories.service.js';
import { successResponse } from '../utils/response.util.js';
import { getInstructorIdOrThrow } from '../utils/user.util.js';
import {
  CreateAssignmentCategoryDto,
  UpdateAssignmentCategoryDto,
} from '../validations/assignment-categories.validation.js';

export class AssignmentCategoryController {
  constructor(
    private readonly assignmentCategoryService: AssignmentCategoryService,
  ) {}

  /** 카테고리 생성 */
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 강사 ID 추출 (조교인 경우 연결된 강사 ID 사용)
      const instructorId = getInstructorIdOrThrow(req);
      const data = req.body as CreateAssignmentCategoryDto;

      const result = await this.assignmentCategoryService.createCategory(
        instructorId,
        data,
      );

      return successResponse(res, {
        statusCode: 201,
        message: '과제 카테고리가 생성되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 카테고리 목록 조회 */
  getCategories = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);

      const result =
        await this.assignmentCategoryService.getCategoriesByInstructor(
          instructorId,
        );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 카테고리 단일 조회 */
  getCategoryById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;

      const result = await this.assignmentCategoryService.getCategoryById(
        id,
        instructorId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 카테고리 수정 */
  updateCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;
      const data = req.body as UpdateAssignmentCategoryDto;

      const result = await this.assignmentCategoryService.updateCategory(
        id,
        instructorId,
        data,
      );

      return successResponse(res, {
        message: '과제 카테고리가 수정되었습니다.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 카테고리 삭제 */
  deleteCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;

      await this.assignmentCategoryService.deleteCategory(id, instructorId);

      return successResponse(res, {
        message: '과제 카테고리가 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
