import { Request, Response, NextFunction } from 'express';
import { ClinicsService } from '../services/clinics.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class ClinicsController {
  constructor(private readonly clinicsService: ClinicsService) {}

  /** 채점 완료 및 클리닉 생성 핸들러 */
  completeGrading = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { examId } = req.params;
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const clinicData = req.body;

      const result = await this.clinicsService.completeGrading(
        examId,
        clinicData,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '채점이 완료 처리되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 클리닉 조회 핸들러 */
  getClinics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const query = req.query as unknown as {
        lectureId?: string;
        examId?: string;
      };

      const result = await this.clinicsService.getClinics(
        userType,
        profileId,
        query,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '클리닉 목록을 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 다중 클리닉 수정 핸들러 */
  updateClinics = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const updateData = req.body;

      const result = await this.clinicsService.updateClinics(
        updateData,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '클리닉 수정 완료',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 학생용 클리닉 조회 핸들러 */
  getClinicsByStudent = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const userType = user.userType as UserType;

      const result = await this.clinicsService.getClinicsByStudent(
        userType,
        profileId,
      );

      return successResponse(res, {
        data: { clinics: result },
        message: '클리닉 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
