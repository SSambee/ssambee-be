import { Request, Response, NextFunction } from 'express';
import { AssistantsService } from '../services/assistants.service.js';
import { successResponse } from '../utils/response.util.js';
import { getProfileIdOrThrow } from '../utils/user.util.js';
import { GetAssistantsQueryDto } from '../validations/assistants.validation.js';

export class AssistantsController {
  constructor(private readonly assistantsService: AssistantsService) {}

  /**
   * GET /api/mgmt/v1/assistants
   * 조교 목록 조회
   */
  getAssistants = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const query = req.query as unknown as GetAssistantsQueryDto;

      const assistants = await this.assistantsService.getAssistantsByInstructor(
        instructorId,
        query.status,
      );

      return successResponse(res, {
        data: { assistants },
        message: '조교 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/mgmt/v1/assistants/:id
   * 조교 정보 수정 / 가입 승인 / 가입 거부 / 탈퇴 처리
   */
  updateAssistant = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const { id } = req.params;
      const query = req.query as { sign?: 'approve' | 'reject' | 'expire' };
      const body = req.body;

      let result;
      let message = '';

      // sign 쿼리 파라미터에 따라 분기
      if (query.sign === 'approve') {
        result = await this.assistantsService.approveAssistant(
          id,
          instructorId,
        );
        message = '조교 가입 승인 완료';
      } else if (query.sign === 'reject') {
        result = await this.assistantsService.rejectAssistant(
          id,
          instructorId,
          req.headers,
        );
        message = '조교 가입 거부 완료';
      } else if (query.sign === 'expire') {
        result = await this.assistantsService.expireAssistant(
          id,
          instructorId,
          req.headers,
        );
        message = '조교 탈퇴 처리 완료';
      } else {
        // 일반 정보 수정
        result = await this.assistantsService.updateAssistant(
          id,
          instructorId,
          body,
        );
        message = '조교 정보 수정 완료';
      }

      return successResponse(res, {
        data: { assistant: result },
        message,
      });
    } catch (error) {
      next(error);
    }
  };
}
