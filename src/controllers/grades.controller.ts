import { Request, Response, NextFunction } from 'express';
import { GradesService } from '../services/grades.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import { BadRequestException } from '../err/http.exception.js';

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

  /** (관리자용) 성적 상세 조회 핸들러 */
  getGradeDetailForInstructor = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { gradeId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getGradeDetailForInstructor(
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

  /** (관리자용) 수강생 성적/답안 상세 조회 핸들러 */
  getStudentGradeWithAnswers = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { examId, lectureEnrollmentId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getStudentGradeWithAnswers(
        examId,
        lectureEnrollmentId,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** [NEW] 성적표 리포트 조회 핸들러 - ID 기반 */
  getGradeReport = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { gradeId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.getGradeReport(
        gradeId,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
      });
    } catch (error) {
      next(error);
    }
  };

  /** [NEW] 성적표 리포트 파일 업로드 핸들러 - ID 기반 */
  uploadGradeReportFile = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { gradeId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;
      const file = req.file;

      if (!file) {
        throw new BadRequestException('파일이 첨부되지 않았습니다.');
      }

      const result = await this.gradesService.uploadGradeReportFile(
        gradeId,
        file,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
        message: '성적표 리포트 업로드 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** [NEW] 성적표 리포트 설명 업데이트 핸들러 - ID 기반 */
  updateGradeReportDescription = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { gradeId } = req.params;
      const { description } = req.body;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.gradesService.updateGradeReportDescription(
        gradeId,
        description,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
        message: '성적표 리포트 설명 업데이트 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** [NEW] 성적표 리포트 파일 다운로드 URL 조회 핸들러 - ID 기반 */
  getGradeReportFileDownload = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { gradeId } = req.params;
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const downloadUrl =
        await this.gradesService.getGradeReportFileDownloadUrl(
          gradeId,
          userType,
          profileId,
        );

      return successResponse(res, {
        data: { downloadUrl },
        message: '다운로드 URL 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
