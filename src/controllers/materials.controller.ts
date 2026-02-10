import { NextFunction, Request, Response } from 'express';
import { MaterialsService } from '../services/materials.service.js';
import {
  UploadMaterialDto,
  UpdateMaterialDto,
  GetMaterialsQueryDto,
} from '../validations/materials.validation.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';

export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  /** 자료 업로드 */
  uploadMaterial = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 경로 파라미터에서만 lectureId 가져오기
      const { lectureId } = req.params;
      const data = req.body as UploadMaterialDto;
      const file = req.file;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.materialsService.uploadMaterial(
        lectureId || undefined, // undefined일 수 있음 (Global Library)
        data,
        file,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 201,
        data: result,
        message: '자료가 성공적으로 업로드되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자료 목록 조회 (강의별 또는 전체) */
  getMaterials = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lectureId } = req.params;
      const query = req.query as unknown as GetMaterialsQueryDto;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.materialsService.getMaterials(
        { ...query, lectureId },
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '자료 목록을 성공적으로 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자료 상세 조회 */
  getMaterialDetail = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const { materialsId } = req.params;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.materialsService.getMaterialDetail(
        materialsId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '자료 상세 정보를 조회했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자료 수정 */
  updateMaterial = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { materialsId } = req.params;
      const data = req.body as UpdateMaterialDto;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.materialsService.updateMaterial(
        materialsId,
        data,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '자료 정보가 수정되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 자료 삭제 */
  deleteMaterial = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { materialsId } = req.params;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      await this.materialsService.deleteMaterial(
        materialsId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: null,
        message: '자료가 삭제되었습니다.',
      });
    } catch (error) {
      next(error);
    }
  };

  /** 다운로드 URL 획득 */
  getDownloadUrl = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { materialsId } = req.params;

      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const result = await this.materialsService.getDownloadUrl(
        materialsId,
        userType,
        profileId,
      );

      return successResponse(res, {
        statusCode: 200,
        data: result,
        message: '다운로드 URL을 생성했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
