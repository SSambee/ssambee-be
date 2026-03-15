import type { Request, Response, NextFunction } from 'express';
import { successResponse } from '../utils/response.util.js';
import { StatisticsService } from '../services/statistics.service.js';
import { UnauthorizedException } from '../err/http.exception.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  /** 통계(비율) 산출 및 저장 */
  calculateStatistics = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      if (!req.user) {
        throw new UnauthorizedException('로그인이 필요합니다.');
      }
      const { examId } = req.params;
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const profileId = getProfileIdOrThrow(req);

      const result = await this.statisticsService.calculateAndSaveStatistics(
        examId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: result,
        message: '통계가 성공적으로 산출 및 저장되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 캐싱된 통계 조회 */
  getStatistics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new UnauthorizedException('로그인이 필요합니다.');
      }
      const { examId } = req.params;
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const profileId = getProfileIdOrThrow(req);

      const result = await this.statisticsService.getStatistics(
        examId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '통계 데이터를 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
