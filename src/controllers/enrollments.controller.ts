import { Request, Response, NextFunction } from 'express';
import { EnrollmentsService } from '../services/enrollments.service.js';
import {
  GetEnrollmentsQueryDto,
  GetSvcEnrollmentsQueryDto,
} from '../validations/enrollments.validation.js';
import { getPagingData } from '../utils/pagination.util.js';
import { UserType } from '../constants/auth.constant.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';

export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  /** 수강 목록 조회 핸들러 */
  getEnrollments = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      // 강사/조교인 경우 (관리자 페이지 등에서 호출 시)
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        const query = req.query as unknown as GetEnrollmentsQueryDto;
        const { enrollments, totalCount } =
          await this.enrollmentsService.getEnrollments(
            userType,
            profileId,
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
          message: '수강 목록 조회 성공',
        });
      }

      // 학생/학부모인 경우
      const query = req.query as unknown as GetSvcEnrollmentsQueryDto;
      const { enrollments, totalCount } =
        await this.enrollmentsService.getMyEnrollments(
          userType,
          profileId,
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
        message: '수강 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**  수강 상세 조회 핸들러 */
  getEnrollment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      let enrollment;

      // 강사/조교인 경우
      if (userType === UserType.INSTRUCTOR || userType === UserType.ASSISTANT) {
        enrollment = await this.enrollmentsService.getEnrollmentDetail(
          enrollmentId,
          userType,
          profileId,
        );
      } else {
        // 학생/학부모인 경우
        enrollment = await this.enrollmentsService.getEnrollmentById(
          enrollmentId,
          userType,
          profileId,
        );
      }

      return successResponse(res, {
        data: { enrollment },
        message: '수강 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  // Enrollment 생성
  createEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body;

      const enrollment = await this.enrollmentsService.createEnrollment(
        lectureId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: { enrollment },
        message: '수강 등록 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** Enrollment 수정 */
  updateEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { enrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const body = req.body;

      const enrollment = await this.enrollmentsService.updateEnrollment(
        enrollmentId,
        body,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: { enrollment },
        message: '수강 정보 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
