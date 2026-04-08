import { NextFunction, Request, Response } from 'express';
import { BillingController } from './billing.controller.js';
import {
  BillingMode,
  BillingProductType,
  PaymentMethodType,
} from '../constants/billing.constant.js';

describe('BillingController - @unit', () => {
  let mockBillingService: {
    listActiveProducts: jest.Mock;
    listProducts: jest.Mock;
  };
  let billingController: BillingController;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBillingService = {
      listActiveProducts: jest.fn(),
      listProducts: jest.fn(),
    };

    billingController = new BillingController(mockBillingService as never);
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it('공개 상품 조회 시 노출 가능한 필드만 반환해야 한다', async () => {
    mockBillingService.listActiveProducts.mockResolvedValue([
      {
        id: 'product-1',
        code: 'PASS_SINGLE_1M',
        name: '1개월 이용권',
        description: '1개월 이용권 + 기본 포함 크레딧 1000',
        highlights: ['1개월 이용권', '기본 포함 크레딧 1000'],
        productType: BillingProductType.PASS_SINGLE,
        billingMode: BillingMode.ONE_TIME,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        durationMonths: 1,
        includedCreditAmount: 1000,
        rechargeCreditAmount: 0,
        price: 99000,
        isActive: true,
        sortOrder: 1,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'product-2',
        code: 'CREDIT_PACK_3000',
        name: '크레딧 충전권 3000',
        description: '90일 만료 추가 충전 크레딧 3000',
        highlights: ['추가 충전 크레딧 3000', '구매 후 90일 내 사용'],
        productType: BillingProductType.CREDIT_PACK,
        billingMode: BillingMode.ONE_TIME,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        durationMonths: null,
        includedCreditAmount: 0,
        rechargeCreditAmount: 3000,
        price: 33000,
        isActive: true,
        sortOrder: 2,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z'),
      },
    ]);

    await billingController.getPublicProducts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(mockBillingService.listActiveProducts).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      data: {
        passSingleProducts: [
          {
            name: '1개월 이용권',
            description: '1개월 이용권 + 기본 포함 크레딧 1000',
            highlights: ['1개월 이용권', '기본 포함 크레딧 1000'],
            productType: BillingProductType.PASS_SINGLE,
            billingMode: BillingMode.ONE_TIME,
            durationMonths: 1,
            includedCreditAmount: 1000,
            rechargeCreditAmount: 0,
            price: 99000,
          },
        ],
        creditPackProducts: [
          {
            name: '크레딧 충전권 3000',
            description: '90일 만료 추가 충전 크레딧 3000',
            highlights: ['추가 충전 크레딧 3000', '구매 후 90일 내 사용'],
            productType: BillingProductType.CREDIT_PACK,
            billingMode: BillingMode.ONE_TIME,
            durationMonths: null,
            includedCreditAmount: 0,
            rechargeCreditAmount: 3000,
            price: 33000,
          },
        ],
      },
      message: '공개 결제 상품 조회 성공',
    });
  });

  it('강사용 결제 상품 조회 시 productType 기준으로 그룹핑해야 한다', async () => {
    mockBillingService.listActiveProducts.mockResolvedValue([
      {
        id: 'product-1',
        code: 'PASS_SINGLE_1M',
        name: '1개월 이용권',
        description: '1개월 이용권 + 기본 포함 크레딧 1000',
        highlights: ['1개월 이용권', '기본 포함 크레딧 1000'],
        productType: BillingProductType.PASS_SINGLE,
        billingMode: BillingMode.ONE_TIME,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        durationMonths: 1,
        includedCreditAmount: 1000,
        rechargeCreditAmount: 0,
        price: 99000,
        isActive: true,
        sortOrder: 1,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z'),
      },
      {
        id: 'product-2',
        code: 'CREDIT_PACK_3000',
        name: '크레딧 충전권 3000',
        description: '90일 만료 추가 충전 크레딧 3000',
        highlights: ['추가 충전 크레딧 3000', '구매 후 90일 내 사용'],
        productType: BillingProductType.CREDIT_PACK,
        billingMode: BillingMode.ONE_TIME,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        durationMonths: null,
        includedCreditAmount: 0,
        rechargeCreditAmount: 3000,
        price: 33000,
        isActive: true,
        sortOrder: 2,
        createdAt: new Date('2026-04-03T00:00:00.000Z'),
        updatedAt: new Date('2026-04-03T00:00:00.000Z'),
      },
    ]);

    await billingController.getProducts(
      mockReq as Request,
      mockRes as Response,
      mockNext,
    );

    expect(mockBillingService.listActiveProducts).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith({
      status: 'success',
      data: {
        passSingleProducts: [
          expect.objectContaining({
            id: 'product-1',
            productType: BillingProductType.PASS_SINGLE,
          }),
        ],
        creditPackProducts: [
          expect.objectContaining({
            id: 'product-2',
            productType: BillingProductType.CREDIT_PACK,
          }),
        ],
      },
      message: '결제 상품 조회 성공',
    });
  });
});
