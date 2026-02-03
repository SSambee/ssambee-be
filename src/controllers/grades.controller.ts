import { Request, Response, NextFunction } from 'express';
import { GradesService } from '../services/grades.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class GradesController {
  constructor(private readonly gradesService: GradesService) {}

  /** 채점 제출 핸들러 */
  submitGrading = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { examId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const gradingData = req.body;

      const result = await this.gradesService.submitGrading(
        examId,
        gradingData,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
        message: '채점 및 성적 등록 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 성적 목록 조회 핸들러 */
  getGradesByExam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { examId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getGradesByExam(
        examId,
        userType,
        profileId,
      );

      return successResponse(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  /** 수강별 성적 목록 조회 (학생/학부모용) - LectureEnrollment ID 기준 */
  getGradesByEnrollment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureEnrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getGradesByLectureEnrollment(
        lectureEnrollmentId,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: { grades: result },
        message: '성적 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 성적 상세 조회 (학생/학부모용) */
  getGradeDetail = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gradeId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getGradeDetail(
        gradeId,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: { grade: result },
        message: '성적 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
