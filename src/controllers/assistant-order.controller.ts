import { Request, Response, NextFunction } from 'express';
import { AssistantOrderService } from '../services/assistant-order.service.js';
import { successResponse } from '../utils/response.util.js';
import { getProfileIdOrThrow } from '../utils/user.util.js';

export class AssistantOrderController {
  constructor(private readonly assistantOrderService: AssistantOrderService) {}

  /**
   * POST /api/mgmt/v1/assistant-order
   * 지시 생성
   */
  createOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const body = req.body;

      const result = await this.assistantOrderService.createOrder(
        instructorId,
        body,
      );

      return successResponse(res, {
        statusCode: 201,
        data: { order: result },
        message: '지시 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
