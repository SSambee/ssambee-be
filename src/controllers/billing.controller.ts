import { NextFunction, Request, Response } from 'express';
import { BillingService } from '../services/billing.service.js';
import { successResponse } from '../utils/response.util.js';
import {
  getAuthUser,
  getInstructorIdOrThrow,
  getProfileIdOrThrow,
} from '../utils/user.util.js';

export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  private getActor(req: Request) {
    const user = getAuthUser(req);

    return {
      userId: user?.id,
      role:
        typeof user?.role === 'string'
          ? user.role
          : Array.isArray(user?.role)
            ? user.role.join(',')
            : user?.userType,
    };
  }

  getProducts = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const products = await this.billingService.listActiveProducts();

      return successResponse(res, {
        data: products,
        message: '결제 상품 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getAdminProducts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const products = await this.billingService.listProducts();

      return successResponse(res, {
        data: products,
        message: '관리자 상품 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  createProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await this.billingService.createProduct(req.body);

      return successResponse(res, {
        statusCode: 201,
        data: product,
        message: '상품 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  updateProduct = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const product = await this.billingService.updateProduct(
        req.params.id,
        req.body,
      );

      return successResponse(res, {
        data: product,
        message: '상품 수정 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  createBankTransferPayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const payment = await this.billingService.createBankTransferPayment(
        instructorId,
        req.body,
        this.getActor(req),
      );

      return successResponse(res, {
        statusCode: 201,
        data: payment,
        message: '무통장 결제 요청 생성 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  markPaymentDeposited = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const payment = await this.billingService.markPaymentDeposited(
        req.params.paymentId,
        instructorId,
        req.body,
        this.getActor(req),
      );

      return successResponse(res, {
        data: payment,
        message: '입금 완료 알림 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getInstructorPayments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const result = await this.billingService.listInstructorPayments(
        instructorId,
        req.query as unknown as {
          status?: string;
          page: number;
          limit: number;
        },
      );

      return successResponse(res, {
        data: result,
        message: '결제 내역 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getInstructorPayment = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const payment = await this.billingService.getInstructorPayment(
        req.params.paymentId,
        instructorId,
      );

      return successResponse(res, {
        data: payment,
        message: '결제 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getAdminPayments = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const result = await this.billingService.listPayments(
        req.query as unknown as {
          status?: string;
          page: number;
          limit: number;
        },
      );

      return successResponse(res, {
        data: result,
        message: '관리자 결제 목록 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getAdminPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await this.billingService.getPayment(req.params.id);

      return successResponse(res, {
        data: payment,
        message: '관리자 결제 상세 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  approvePayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await this.billingService.approvePayment(
        req.params.id,
        this.getActor(req),
        req.body.memo,
      );

      return successResponse(res, {
        data: payment,
        message: '결제 승인 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  rejectPayment = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const payment = await this.billingService.rejectPayment(
        req.params.id,
        this.getActor(req),
        req.body.reason,
      );

      return successResponse(res, {
        data: payment,
        message: '결제 반려 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  updateReceiptRequest = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const receiptRequest = await this.billingService.updateReceiptRequest(
        req.params.id,
        req.body,
      );

      return successResponse(res, {
        data: receiptRequest,
        message: '영수증 요청 처리 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getEntitlements = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const entitlements =
        await this.billingService.listEntitlementsByInstructor(instructorId);

      return successResponse(res, {
        data: entitlements,
        message: '이용권 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getCredits = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const credits = await this.billingService.getCreditSummary(instructorId);

      return successResponse(res, {
        data: credits,
        message: '크레딧 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getCreditHistory = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const instructorId = getProfileIdOrThrow(req);
      const history = await this.billingService.listCreditLedgers(
        instructorId,
        req.query as unknown as { page: number; limit: number },
      );

      return successResponse(res, {
        data: history,
        message: '크레딧 이력 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };

  getAccessStatus = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const instructorId = getInstructorIdOrThrow(req);
      const status =
        await this.billingService.getMgmtAccessStatus(instructorId);

      return successResponse(res, {
        data: status,
        message: '접근 상태 조회 성공',
      });
    } catch (error) {
      next(error);
    }
  };
}
