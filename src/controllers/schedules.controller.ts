import { Request, Response, NextFunction } from 'express';
import { SchedulesService } from '../services/schedules.service.js';
import { successResponse } from '../utils/response.util.js';
import { getInstructorIdOrThrow, getAuthUser } from '../utils/user.util.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  GetSchedulesQueryDto,
} from '../validations/schedules.validation.js';

export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  /** 일정 생성 */
  createSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 1. 강사 ID 추출
      const instructorId = getInstructorIdOrThrow(req);

      // 2. 작성자 정보 추출
      const user = getAuthUser(req);

      const authorName = user.name;
      const authorRole = user.userType; // INSTRUCTOR or ASSISTANT

      const data = req.body as CreateScheduleDto;

      const result = await this.schedulesService.createSchedule(
        instructorId,
        authorName,
        authorRole,
        data,
      );

      const kstResult = transformDateFieldsToKst(result, [
        'startTime',
        'endTime',
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        statusCode: 201,
        message: '일정이 생성되었습니다.',
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 일정 목록 조회 */
  getSchedules = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const query = req.query as unknown as GetSchedulesQueryDto;

      const result = await this.schedulesService.getSchedules(
        instructorId,
        query,
      );

      const kstResult = transformDateFieldsToKst(result, [
        'startTime',
        'endTime',
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 일정 상세 조회 */
  getScheduleById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;

      const result = await this.schedulesService.getScheduleById(
        instructorId,
        id,
      );

      const kstResult = transformDateFieldsToKst(result, [
        'startTime',
        'endTime',
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 일정 수정 */
  updateSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;
      const data = req.body as UpdateScheduleDto;

      const result = await this.schedulesService.updateSchedule(
        id,
        instructorId,
        data,
      );

      const kstResult = transformDateFieldsToKst(result, [
        'startTime',
        'endTime',
        'createdAt',
        'updatedAt',
      ]);

      return successResponse(res, {
        message: '일정이 수정되었습니다.',
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 일정 삭제 */
  deleteSchedule = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const { id } = req.params;

      await this.schedulesService.deleteSchedule(id, instructorId);

      return successResponse(res, {
        message: '일정이 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
