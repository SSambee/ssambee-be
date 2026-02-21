import { Request, Response, NextFunction } from 'express';
import { UserType } from '../constants/auth.constant.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { DashboardService } from '../services/dashboard.service.js';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.dashboardService.getDashboard(
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '대시보드를 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
