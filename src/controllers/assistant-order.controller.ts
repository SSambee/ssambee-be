import { Request, Response, NextFunction } from 'express';
import { AssistantOrderService } from '../services/assistant-order.service.js';
import { successResponse } from '../utils/response.util.js';
import { getAuthUser, getProfileIdOrThrow } from '../utils/user.util.js';
import {
  GetAssistantOrdersQueryDto,
  UpdateAssistantOrderDto,
} from '../validations/assistant-order.validation.js';
import { UserType } from '../constants/auth.constant.js';

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

  /**
   * GET /api/mgmt/v1/assistant-order
   * 지시 목록 조회
   */
  getOrders = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const query = req.query as unknown as GetAssistantOrdersQueryDto;

      let result;

      if (user.userType === UserType.INSTRUCTOR) {
        result = await this.assistantOrderService.getOrdersByInstructor(
          profileId,
          query,
        );
      } else {
        // 조교인 경우
        result = await this.assistantOrderService.getOrdersByAssistant(
          profileId,
          query,
        );
      }

      return successResponse(res, {
        data: result,
        message: '지시 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * GET /api/mgmt/v1/assistant-order/:id
   * 지시 개별 조회
   */
  getOrderById = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const { id } = req.params;

      const result = await this.assistantOrderService.getOrderById(
        user.userType as UserType,
        profileId,
        id,
      );

      return successResponse(res, {
        data: result,
        message: '지시 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * PATCH /api/mgmt/v1/assistant-order/:id
   * 지시 수정 (강사: 전체, 조교: 상태만)
   */
  updateOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = getAuthUser(req);
      const profileId = getProfileIdOrThrow(req);
      const { id } = req.params;
      const body = req.body;

      let result;

      if (user.userType === UserType.INSTRUCTOR) {
        result = await this.assistantOrderService.updateOrder(
          user.userType,
          profileId,
          id,
          body as UpdateAssistantOrderDto,
        );
      } else {
        // 조교인 경우
        result = await this.assistantOrderService.updateOrderStatus(
          user.userType as UserType,
          profileId,
          id,
          body.status,
        );
      }

      return successResponse(res, {
        data: { order: result },
        message: '지시 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * DELETE /api/mgmt/v1/assistant-order/:id
   * 지시 삭제 (강사 전용)
   */
  deleteOrder = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const { id } = req.params;

      await this.assistantOrderService.deleteOrder(instructorId, id);

      return successResponse(res, {
        statusCode: 204,
        message: '지시 삭제 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
