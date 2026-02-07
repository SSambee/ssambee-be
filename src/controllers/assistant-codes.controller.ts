import { Request, Response, NextFunction } from 'express';
import { AssistantCodesService } from '../services/assistant-codes.service.js';
import { successResponse } from '../utils/response.util.js';
import { transformDateFieldsToKst } from '../utils/date.util.js';
import { getProfileIdOrThrow } from '../utils/user.util.js';

export class AssistantCodesController {
  constructor(private readonly assistantCodesService: AssistantCodesService) {}

  /** 조교 가입 코드 생성 */
  createCode = async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 인증 미들웨어(requireAuth)를 통과했으므로 req.user.id 존재
      const instructorId = getProfileIdOrThrow(req);

      const result = await this.assistantCodesService.createCode(instructorId);

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'expireAt',
      ]);

      return successResponse(res, {
        statusCode: 201,
        message: '조교 가입 코드가 생성되었습니다.',
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };

  /** 조교 가입 코드 목록 조회 */
  getCodesList = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);

      const result =
        await this.assistantCodesService.getCodesByInstructor(instructorId);

      // 날짜 데이터를 한국 시간으로 변환
      const kstResult = transformDateFieldsToKst(result, [
        'createdAt',
        'expireAt',
      ]);

      return successResponse(res, {
        data: kstResult,
      });
    } catch (error) {
      next(error);
    }
  };
}
