import { Request, Response, NextFunction } from 'express';
import { LectureEnrollmentsService } from '../services/lecture-enrollments.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class LectureEnrollmentsController {
  constructor(
    private readonly lectureEnrollmentsService: LectureEnrollmentsService,
  ) {}

  /** 강의수강생 상세 조회 (성적 포함) 핸들러 */
  getLectureEnrollmentDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureEnrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result =
        await this.lectureEnrollmentsService.getLectureEnrollmentDetail(
          lectureEnrollmentId,
          userType,
          profileId,
        );

      return successResponse(res, {
        data: result,
        message: '강의 수강생 정보 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
