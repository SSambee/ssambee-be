import { Request, Response, NextFunction } from 'express';
import { ProfileService } from '../services/profile.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import { UserType } from '../constants/auth.constant.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';

export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * 내 프로필 조회
   */
  getMyProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;

      const profile = await this.profileService.getMyProfile(
        profileId,
        userType,
      );

      return successResponse(res, {
        data: transformDateFieldsToKst(profile, ['createdAt']),
        message: '내 프로필 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * 내 프로필 수정
   */
  updateMyProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const profileId = getProfileIdOrThrow(req);
      const user = getAuthUser(req);
      const userType = user.userType as UserType;
      const data = req.body;

      // 보안: userType, email, password는 수정 불가 (무시)
       
      const { userType: _, email: __, password: ___, ...updateData } = data;

      const profile = await this.profileService.updateMyProfile(
        profileId,
        userType,
        updateData,
      );

      return successResponse(res, {
        data: transformDateFieldsToKst(profile, ['updatedAt']),
        message: '내 프로필 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
