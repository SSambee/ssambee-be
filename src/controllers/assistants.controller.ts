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
}
