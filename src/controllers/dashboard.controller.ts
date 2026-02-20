import { Request, Response, NextFunction } from 'express';
import { DashboardService } from '../services/dashboard.service.js';
import { UserType } from '../constants/auth.constant.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { GetDashboardQueryDto } from '../validations/dashboard.validation.js';

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /** 대시보드 조회 핸들러 */
  getDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const { childLinkId } = req.query as unknown as GetDashboardQueryDto;

      const dashboardData = await this.dashboardService.getDashboard(
        userType,
        profileId,
        childLinkId,
      );

      return successResponse(res, {
        data: dashboardData,
        message: '대시보드 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
