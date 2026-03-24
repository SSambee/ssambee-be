import { BillingService } from './billing.service.js';
import { BillingRepository } from '../repos/billing.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  BillingErrorCode,
  BillingProductType,
  CreditBucketStatus,
  CreditLedgerType,
  CreditSourceType,
  EntitlementStatus,
  IncludedCreditPolicy,
  PaymentMethodType,
  PaymentStatus,
} from '../constants/billing.constant.js';
import { ForbiddenException } from '../err/http.exception.js';

describe('BillingService', () => {
  let service: BillingService;
  let mockBillingRepo: jest.Mocked<Partial<BillingRepository>>;
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T00:00:00.000Z'));

    mockBillingRepo = {
      findProductById: jest.fn(),
      createPayment: jest.fn(),
      createPaymentItem: jest.fn(),
      createPaymentStatusHistory: jest.fn(),
      createReceiptRequest: jest.fn(),
      findPaymentById: jest.fn(),
      updatePayment: jest.fn(),
      findLatestEntitlement: jest.fn(),
      createEntitlement: jest.fn(),
      findIncludedCreditBucketByEntitlementId: jest.fn(),
      upsertIncludedCreditBucket: jest.fn(),
      listActiveCreditBuckets: jest.fn(),
      upsertCreditWallet: jest.fn(),
      createCreditLedger: jest.fn(),
      listEntitlementsByInstructor: jest.fn(),
      findActiveEntitlement: jest.fn(),
      findReadyQueuedEntitlement: jest.fn(),
      updateEntitlement: jest.fn(),
      findRechargeCreditBucketByPaymentItemId: jest.fn(),
      upsertRechargeCreditBucket: jest.fn(),
      updateCreditBucket: jest.fn(),
    };

    mockPrisma = {
      $transaction: jest.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({} as never);
        }

        return Promise.all(input as Promise<unknown>[]);
      }),
    };

    service = new BillingService(
      mockBillingRepo as BillingRepository,
      mockPrisma as PrismaClient,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('무통장 결제 생성 시 payment/item/history/receipt를 함께 저장해야 한다', async () => {
    const product = {
      id: 'product-1',
      code: 'PASS_SINGLE_1M',
      name: '1개월 이용권',
      productType: BillingProductType.PASS_SINGLE,
      paymentMethodType: PaymentMethodType.BANK_TRANSFER,
      durationMonths: 1,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      rechargeCreditAmount: 0,
      price: 99000,
      isActive: true,
    };
    const payment = {
      id: 'payment-1',
    };
    const paymentDetail = {
      id: 'payment-1',
      receiptRequest: { type: 'CASH_RECEIPT' },
    };

    (mockBillingRepo.findProductById as jest.Mock).mockResolvedValue(product);
    (mockBillingRepo.createPayment as jest.Mock).mockResolvedValue(payment);
    (mockBillingRepo.findPaymentById as jest.Mock).mockResolvedValue(
      paymentDetail,
    );

    const result = await service.createBankTransferPayment(
      'instructor-1',
      {
        productId: 'product-1',
        quantity: 1,
        depositorName: '홍길동',
        receiptRequest: {
          type: 'CASH_RECEIPT',
          phoneNumber: '010-1234-5678',
        },
      },
      {
        userId: 'user-1',
        role: 'INSTRUCTOR',
      },
    );

    expect(mockBillingRepo.createPayment).toHaveBeenCalled();
    expect(mockBillingRepo.createPaymentItem).toHaveBeenCalled();
    expect(mockBillingRepo.createPaymentStatusHistory).toHaveBeenCalled();
    expect(mockBillingRepo.createReceiptRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-1',
        type: 'CASH_RECEIPT',
        cashReceiptPhoneNumber: '010-1234-5678',
      }),
      expect.anything(),
    );
    expect(result).toEqual(paymentDetail);
  });

  it('첫 이용권 승인 시 ACTIVE entitlement와 포함 크레딧을 생성해야 한다', async () => {
    const payment = {
      id: 'payment-1',
      instructorId: 'instructor-1',
      status: PaymentStatus.PENDING_APPROVAL,
      approvedAt: null,
      items: [
        {
          id: 'item-1',
          quantity: 1,
          durationMonthsSnapshot: 1,
          includedCreditAmountSnapshot: IncludedCreditPolicy.MONTHLY_AMOUNT,
          rechargeCreditAmountSnapshot: 0,
          productTypeSnapshot: BillingProductType.PASS_SINGLE,
        },
      ],
    };
    const entitlement = {
      id: 'entitlement-1',
      instructorId: 'instructor-1',
      paymentItemId: 'item-1',
      sequenceNo: 1,
      status: EntitlementStatus.ACTIVE,
      startsAt: new Date('2026-03-24T00:00:00.000Z'),
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
      activatedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const bucket = {
      id: 'bucket-1',
      instructorId: 'instructor-1',
      paymentItemId: 'item-1',
      entitlementId: 'entitlement-1',
      sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      remainingAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-04-23T14:59:59.999Z'),
    };
    const finalPayment = {
      ...payment,
      status: PaymentStatus.APPROVED,
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce(finalPayment);
    (mockBillingRepo.findLatestEntitlement as jest.Mock).mockResolvedValue(
      null,
    );
    (mockBillingRepo.createEntitlement as jest.Mock).mockResolvedValue(
      entitlement,
    );
    (
      mockBillingRepo.findIncludedCreditBucketByEntitlementId as jest.Mock
    ).mockResolvedValue(null);
    (mockBillingRepo.upsertIncludedCreditBucket as jest.Mock).mockResolvedValue(
      bucket,
    );
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue([
      bucket,
    ]);
    (
      mockBillingRepo.listEntitlementsByInstructor as jest.Mock
    ).mockResolvedValue([entitlement]);
    (mockBillingRepo.findActiveEntitlement as jest.Mock).mockResolvedValue(
      entitlement,
    );

    await service.approvePayment('payment-1', {
      userId: 'admin-1',
      role: 'admin',
    });

    expect(mockBillingRepo.createEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        instructorId: 'instructor-1',
        paymentItemId: 'item-1',
        status: EntitlementStatus.ACTIVE,
        includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.upsertIncludedCreditBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        instructorId: 'instructor-1',
        entitlementId: 'entitlement-1',
        sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
        originalAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createCreditLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CreditLedgerType.GRANT,
        deltaAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      }),
      expect.anything(),
    );
  });

  it('기존 이용권이 있으면 새 이용권은 QUEUED로 적재해야 한다', async () => {
    const payment = {
      id: 'payment-2',
      instructorId: 'instructor-1',
      status: PaymentStatus.PENDING_APPROVAL,
      approvedAt: null,
      items: [
        {
          id: 'item-2',
          quantity: 1,
          durationMonthsSnapshot: 1,
          includedCreditAmountSnapshot: IncludedCreditPolicy.MONTHLY_AMOUNT,
          rechargeCreditAmountSnapshot: 0,
          productTypeSnapshot: BillingProductType.PASS_SINGLE,
        },
      ],
    };
    const existingEntitlement = {
      id: 'entitlement-current',
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
    };
    const queuedEntitlement = {
      id: 'entitlement-next',
      instructorId: 'instructor-1',
      paymentItemId: 'item-2',
      sequenceNo: 1,
      status: EntitlementStatus.QUEUED,
      startsAt: new Date('2026-04-23T15:00:00.000Z'),
      endsAt: new Date('2026-05-23T14:59:59.999Z'),
      activatedAt: null,
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce({ ...payment, status: PaymentStatus.APPROVED });
    (mockBillingRepo.findLatestEntitlement as jest.Mock).mockResolvedValue(
      existingEntitlement,
    );
    (mockBillingRepo.createEntitlement as jest.Mock).mockResolvedValue(
      queuedEntitlement,
    );
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (
      mockBillingRepo.listEntitlementsByInstructor as jest.Mock
    ).mockResolvedValue([queuedEntitlement]);
    (mockBillingRepo.findActiveEntitlement as jest.Mock).mockResolvedValue(
      null,
    );
    (mockBillingRepo.findReadyQueuedEntitlement as jest.Mock).mockResolvedValue(
      null,
    );

    await service.approvePayment('payment-2', {
      userId: 'admin-1',
      role: 'admin',
    });

    expect(mockBillingRepo.createEntitlement).toHaveBeenCalledWith(
      expect.objectContaining({
        status: EntitlementStatus.QUEUED,
        activatedAt: null,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.upsertIncludedCreditBucket).not.toHaveBeenCalled();
  });

  it('활성 이용권이 없으면 mgmt 접근을 차단해야 한다', async () => {
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    await expect(service.assertMgmtAccess('instructor-1')).rejects.toThrow(
      new ForbiddenException(BillingErrorCode.PLAN_REQUIRED),
    );
  });

  it('크레딧은 만료일이 가까운 bucket부터 차감해야 한다', async () => {
    const earlyBucket = {
      id: 'bucket-early',
      instructorId: 'instructor-1',
      paymentItemId: 'item-early',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 300,
      remainingAmount: 300,
      grantedAt: new Date('2026-03-20T00:00:00.000Z'),
      expiresAt: new Date('2026-03-30T14:59:59.999Z'),
    };
    const lateBucket = {
      id: 'bucket-late',
      instructorId: 'instructor-1',
      paymentItemId: 'item-late',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 500,
      remainingAmount: 500,
      grantedAt: new Date('2026-03-21T00:00:00.000Z'),
      expiresAt: new Date('2026-04-10T14:59:59.999Z'),
    };

    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 800,
        includedAvailable: 0,
        rechargeAvailable: 800,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    (mockBillingRepo.listActiveCreditBuckets as jest.Mock)
      .mockResolvedValueOnce([earlyBucket, lateBucket])
      .mockResolvedValue([
        {
          ...lateBucket,
          remainingAmount: 400,
        },
      ]);

    await service.consumeCredits('instructor-1', 400, {
      type: 'KAKAO_MESSAGE',
    });

    expect(mockBillingRepo.updateCreditBucket).toHaveBeenNthCalledWith(
      1,
      'bucket-early',
      expect.objectContaining({
        remainingAmount: 0,
        status: CreditBucketStatus.DEPLETED,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.updateCreditBucket).toHaveBeenNthCalledWith(
      2,
      'bucket-late',
      expect.objectContaining({
        remainingAmount: 400,
        status: CreditBucketStatus.ACTIVE,
      }),
      expect.anything(),
    );
  });
});
