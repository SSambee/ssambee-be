import { NextFunction, Request, Response } from 'express';
import { successResponse } from '../utils/response.util.js';
import { AdminsService } from '../services/admins.service.js';

export class AdminsController {
  constructor(private readonly adminsService: AdminsService) {}

  inviteAdmin = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await this.adminsService.inviteAdmin(
        req.user!.id,
        req.body,
      );

      return successResponse(res, {
        statusCode: result.resent ? 200 : 201,
        data: result,
        message: '관리자 초대 메일을 전송했습니다.',
      });
    } catch (error) {
      next(error);
    }
  };
}
