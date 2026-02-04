import { Request, Response, NextFunction } from 'express';
import { ExamsService } from '../services/exams.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  /** 강사별 전체 시험 목록 조회 핸들러 */
  getExams = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.examsService.getExamsByInstructor(
        userType,
        profileId,
      );

      return successResponse(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  /** 강의별 시험 목록 조회 핸들러 */
  getExamsByLecture = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { lectureId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.examsService.getExamsByLectureId(
        lectureId,
        userType,
        profileId,
      );

      return successResponse(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  /** 시험 상세 조회 핸들러 */
  getExam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { examId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.examsService.getExamById(
        examId,
        userType,
        profileId,
      );

      return successResponse(res, { data: result });
    } catch (error) {
      next(error);
    }
  };

  /** 시험 생성 핸들러 */
  createExam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lectureId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const examData = req.body;

      const result = await this.examsService.createExam(
        lectureId,
        examData,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: result,
        message: '시험 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 시험 수정 핸들러 */
  updateExam = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { examId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const updateData = req.body;

      const result = await this.examsService.updateExam(
        examId,
        updateData,
        userType,
        profileId,
      );

      return successResponse(res, {
        data: result,
        message: '시험 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
