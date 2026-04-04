import { Request, Response, NextFunction } from 'express';
import { successResponse } from '../utils/response.util.js';
import { AdminUsersService } from '../services/admin-users.service.js';
import type { GetAdminUsersQueryDto } from '../validations/admin-users.validation.js';

export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  getUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.adminUsersService.listInstructorUsers(
        req.query as unknown as GetAdminUsersQueryDto,
      );

      return successResponse(res, {
        data: result,
        message: '관리자 사용자 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getUserStats = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const stats = await this.adminUsersService.getInstructorUserStats();

      return successResponse(res, {
        data: stats,
        message: '관리자 사용자 통계 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
