import { Request, Response, NextFunction } from 'express';
import { ParentsService } from '../services/parents.service.js';
import { UserType } from '../constants/auth.constant.js';
import type { GetSvcEnrollmentsQueryDto } from '../validations/enrollments.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { successResponse } from '../utils/response.util.js';

export class ChildrenController {
  constructor(private readonly parentsService: ParentsService) {}

  /** 자녀 등록 */
  registerChild = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const child = await this.parentsService.registerChild(
        user.userType as UserType,
        profileId,
        req.body,
      );

      return successResponse(res, {
        statusCode: 201,
        data: child,
        message: '자녀 등록 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 목록 조회 */
  getChildren = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const children = await this.parentsService.getChildren(
        user.userType as UserType,
        profileId,
      );

      return successResponse(res, {
        data: children,
        message: '자녀 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 수강 목록 조회 */
  getChildEnrollments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const { id } = req.params;
      const query = req.query as unknown as GetSvcEnrollmentsQueryDto;

      const { enrollments, totalCount } =
        await this.parentsService.getChildEnrollments(
          user.userType as UserType,
          profileId,
          id,
          query,
        );

      const responseData = getPagingData(
        enrollments,
        totalCount,
        query.page,
        query.limit,
      );

      return successResponse(res, {
        data: responseData,
        message: '자녀 수강 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자녀 수강 상세 조회 */
  getChildEnrollmentDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);

      const { id, lectureEnrollmentId } = req.params;
      const enrollment = await this.parentsService.getChildEnrollmentDetail(
        user.userType as UserType,
        profileId,
        id,
        lectureEnrollmentId,
      );

      return successResponse(res, {
        data: enrollment,
        message: '자녀 수강 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
