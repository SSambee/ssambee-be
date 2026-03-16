import { Request, Response, NextFunction } from 'express';
import { ScheduleCategoryService } from '../services/schedule-categories.service.js';
import { successResponse } from '../utils/response.util.js';
import { getInstructorIdOrThrow } from '../utils/user.util.js';
import {
  CreateScheduleCategoryDto,
  UpdateScheduleCategoryDto,
} from '../validations/schedule-categories.validation.js';

export class ScheduleCategoryController {
  constructor(
    private readonly scheduleCategoryService: ScheduleCategoryService,
  ) {}

  /** 카테고리 생성 */
  createCategory = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 강사 ID 추출 (조교인 경우 연결된 강사 ID 사용)
      // getInstructorIdOrThrow 유틸은 강사면 본인 ID, 조교면 instructorId를 반환
      const instructorId = getInstructorIdOrThrow(req);
      const data = req.body as CreateScheduleCategoryDto;

      const result = await this.scheduleCategoryService.createCategory(
        instructorId,
        data,
      );

      return successResponse(res, {
        statusCode: 201,
        message: '일정 카테고리가 생성되었습니다.',
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
        await this.scheduleCategoryService.getCategoriesByInstructor(
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
      const data = req.body as UpdateScheduleCategoryDto;

      const result = await this.scheduleCategoryService.updateCategory(
        id,
        instructorId,
        data,
      );

      return successResponse(res, {
        message: '일정 카테고리가 수정되었습니다.',
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

      await this.scheduleCategoryService.deleteCategory(id, instructorId);

      return successResponse(res, {
        message: '일정 카테고리가 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
