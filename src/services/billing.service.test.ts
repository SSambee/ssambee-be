import { BillingService } from './billing.service.js';
import { BillingRepository } from '../repos/billing.repo.js';
import { PrismaClient } from '../generated/prisma/client.js';
import {
  BillingErrorCode,
  BillingProductType,
  BillingSystemProductCode,
  CreditBucketStatus,
  CreditLedgerType,
  CreditSourceType,
  EntitlementStatus,
  IncludedCreditPolicy,
  PaymentMethodType,
  PaymentRefundStatus,
  PaymentStatus,
  RevocationActionType,
  RevocationTargetType,
} from '../constants/billing.constant.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';

describe('BillingService', () => {
  let service: BillingService;
  let mockBillingRepo: jest.Mocked<Partial<BillingRepository>>;
  let mockPrisma: Partial<PrismaClient>;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-24T00:00:00.000Z'));

    mockBillingRepo = {
      findProductById: jest.fn(),
      findProductByCode: jest.fn(),
      findInstructorById: jest.fn(),
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
      listEntitlementsToExpire: jest.fn().mockResolvedValue([]),
      findReadyQueuedEntitlement: jest.fn(),
      updateEntitlement: jest.fn(),
      findRechargeCreditBucketByPaymentItemId: jest.fn(),
      upsertRechargeCreditBucket: jest.fn(),
      updateCreditBucket: jest.fn(),
      listCreditBucketsToExpire: jest.fn().mockResolvedValue([]),
      findPaymentItemById: jest.fn(),
      createPaymentItemRevocationHistory: jest.fn(),
      listRevocationHistoriesByTargetIds: jest.fn(),
      listCreditBucketsByInstructor: jest.fn(),
      listCreditLedgersByInstructor: jest.fn(),
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
      instructorId: 'instructor-1',
      items: [],
      receiptRequest: { type: 'CASH_RECEIPT' },
    };

    (mockBillingRepo.findProductById as jest.Mock).mockResolvedValue(product);
    (mockBillingRepo.createPayment as jest.Mock).mockResolvedValue(payment);
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);

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
    expect(result).toEqual(
      expect.objectContaining({
        ...paymentDetail,
        hasRevocation: false,
        revokedEntitlementCount: 0,
        revokedRechargeAmount: 0,
      }),
    );
  });

  it('관리자가 0원 충전권을 지급하면 승인 결제와 사용자 지정 만료일 크레딧을 생성해야 한다', async () => {
    const product = {
      id: 'product-admin-grant',
      code: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
      name: '관리자 지급 전용 충전권',
      productType: BillingProductType.CREDIT_PACK,
      durationMonths: null,
    };
    const payment = {
      id: 'payment-admin-grant',
      instructorId: 'instructor-1',
      approvedAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const paymentItem = {
      id: 'item-admin-grant',
      paymentId: 'payment-admin-grant',
      billingProductId: 'product-admin-grant',
      productCodeSnapshot: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
      productNameSnapshot: '관리자 지급 전용 충전권',
      productTypeSnapshot: BillingProductType.CREDIT_PACK,
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      durationMonthsSnapshot: null,
      includedCreditAmountSnapshot: 0,
      rechargeCreditAmountSnapshot: 1500,
      rechargeExpiresInDaysSnapshot: 30,
    };
    const bucket = {
      id: 'bucket-admin-grant',
      instructorId: 'instructor-1',
      paymentItemId: 'item-admin-grant',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 1500,
      remainingAmount: 1500,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-04-22T14:59:59.999Z'),
    };
    const paymentDetail = {
      id: 'payment-admin-grant',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      totalAmount: 0,
      refundStatus: PaymentRefundStatus.NONE,
      items: [
        {
          ...paymentItem,
          entitlements: [],
          creditBuckets: [bucket],
          revocationHistories: [],
        },
      ],
      receiptRequest: null,
      statusHistory: [],
    };

    (mockBillingRepo.findInstructorById as jest.Mock).mockResolvedValue({
      id: 'instructor-1',
    });
    (mockBillingRepo.findProductByCode as jest.Mock).mockResolvedValue(product);
    (mockBillingRepo.createPayment as jest.Mock).mockResolvedValue(payment);
    (mockBillingRepo.createPaymentItem as jest.Mock).mockResolvedValue(
      paymentItem,
    );
    (
      mockBillingRepo.findRechargeCreditBucketByPaymentItemId as jest.Mock
    ).mockResolvedValue(null);
    (mockBillingRepo.upsertRechargeCreditBucket as jest.Mock).mockResolvedValue(
      bucket,
    );
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue([
      bucket,
    ]);
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 1500,
        includedAvailable: 0,
        rechargeAvailable: 1500,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    const result = await service.createAdminCreditGrant(
      'instructor-1',
      {
        creditAmount: 1500,
        expiresInDays: 30,
        reason: '운영 보상',
      },
      {
        userId: 'admin-1',
        role: 'admin',
      },
    );

    expect(mockBillingRepo.createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
        totalAmount: 0,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createPaymentItem).toHaveBeenCalledWith(
      expect.objectContaining({
        productCodeSnapshot: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
        rechargeCreditAmountSnapshot: 1500,
        rechargeExpiresInDaysSnapshot: 30,
        totalPrice: 0,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createPaymentStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 'payment-admin-grant',
        toStatus: PaymentStatus.APPROVED,
        reason: '운영 보상',
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.upsertRechargeCreditBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        originalAmount: 1500,
        remainingAmount: 1500,
        expiresAt: new Date('2026-04-22T14:59:59.999Z'),
      }),
      expect.anything(),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'payment-admin-grant',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
        totalAmount: 0,
        refundStatus: PaymentRefundStatus.NONE,
        hasRevocation: false,
        revokedEntitlementCount: 0,
        revokedRechargeAmount: 0,
      }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        productCodeSnapshot: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
        rechargeCreditAmountSnapshot: 1500,
        rechargeExpiresInDaysSnapshot: 30,
      }),
    );
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
      items: [
        {
          ...payment.items[0],
          entitlements: [entitlement],
          creditBuckets: [bucket],
          revocationHistories: [],
        },
      ],
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce(finalPayment)
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

  it('기존 충전권 승인 시 snapshot 기간이 없으면 기본 90일 만료를 사용해야 한다', async () => {
    const payment = {
      id: 'payment-credit-approve',
      instructorId: 'instructor-1',
      status: PaymentStatus.PENDING_APPROVAL,
      approvedAt: null,
      items: [
        {
          id: 'item-credit-approve',
          quantity: 1,
          durationMonthsSnapshot: null,
          includedCreditAmountSnapshot: 0,
          rechargeCreditAmountSnapshot: 3000,
          productTypeSnapshot: BillingProductType.CREDIT_PACK,
        },
      ],
    };
    const bucket = {
      id: 'bucket-credit-approve',
      instructorId: 'instructor-1',
      paymentItemId: 'item-credit-approve',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 3000,
      remainingAmount: 3000,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-06-22T14:59:59.999Z'),
    };
    const finalPayment = {
      ...payment,
      status: PaymentStatus.APPROVED,
      approvedAt: new Date('2026-03-24T00:00:00.000Z'),
      items: [
        {
          ...payment.items[0],
          entitlements: [],
          creditBuckets: [bucket],
          revocationHistories: [],
        },
      ],
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce(finalPayment)
      .mockResolvedValueOnce(finalPayment);
    (
      mockBillingRepo.findRechargeCreditBucketByPaymentItemId as jest.Mock
    ).mockResolvedValue(null);
    (mockBillingRepo.upsertRechargeCreditBucket as jest.Mock).mockResolvedValue(
      bucket,
    );
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue([
      bucket,
    ]);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 3000,
        includedAvailable: 0,
        rechargeAvailable: 3000,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    await service.approvePayment('payment-credit-approve', {
      userId: 'admin-1',
      role: 'admin',
    });

    expect(mockBillingRepo.upsertRechargeCreditBucket).toHaveBeenCalledWith(
      expect.objectContaining({
        expiresAt: new Date('2026-06-21T14:59:59.999Z'),
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createCreditLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CreditLedgerType.GRANT,
        deltaAmount: 3000,
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
      .mockResolvedValueOnce({
        ...payment,
        status: PaymentStatus.APPROVED,
        items: [
          {
            ...payment.items[0],
            entitlements: [queuedEntitlement],
            creditBuckets: [],
            revocationHistories: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        ...payment,
        status: PaymentStatus.APPROVED,
        items: [
          {
            ...payment.items[0],
            entitlements: [queuedEntitlement],
            creditBuckets: [],
            revocationHistories: [],
          },
        ],
      });
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

  it('최신 queued entitlement부터 회수해야 한다', async () => {
    const queuedOld = {
      id: 'entitlement-old',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 1,
      status: EntitlementStatus.QUEUED,
      startsAt: new Date('2026-04-24T15:00:00.000Z'),
      endsAt: new Date('2026-05-24T14:59:59.999Z'),
      activatedAt: null,
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const queuedLatest = {
      ...queuedOld,
      id: 'entitlement-latest',
      sequenceNo: 2,
      startsAt: new Date('2026-05-24T15:00:00.000Z'),
      endsAt: new Date('2026-06-24T14:59:59.999Z'),
    };
    const paymentItem = {
      id: 'item-pass',
      paymentId: 'payment-pass',
      productTypeSnapshot: BillingProductType.PASS_SINGLE,
      payment: {
        id: 'payment-pass',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
      },
      entitlements: [queuedOld, queuedLatest],
      creditBuckets: [],
      revocationHistories: [],
    };
    const canceledEntitlement = {
      ...queuedLatest,
      status: EntitlementStatus.CANCELED,
      canceledAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const revocationHistory = {
      id: 'revoke-1',
      paymentId: 'payment-pass',
      paymentItemId: 'item-pass',
      targetType: RevocationTargetType.ENTITLEMENT,
      targetId: queuedLatest.id,
      actionType: RevocationActionType.CANCEL,
      fromStatus: EntitlementStatus.QUEUED,
      toStatus: EntitlementStatus.CANCELED,
      deltaAmount: 0,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'batch-1',
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-pass',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      items: [
        {
          ...paymentItem,
          entitlements: [queuedOld, canceledEntitlement],
          creditBuckets: [],
          revocationHistories: [revocationHistory],
        },
      ],
    };

    (mockBillingRepo.findPaymentItemById as jest.Mock)
      .mockResolvedValueOnce(paymentItem)
      .mockResolvedValueOnce(paymentItem);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);
    (mockBillingRepo.updateEntitlement as jest.Mock).mockResolvedValue(
      canceledEntitlement,
    );
    (
      mockBillingRepo.createPaymentItemRevocationHistory as jest.Mock
    ).mockResolvedValue(revocationHistory);
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);

    const result = await service.revokeEntitlementsByPaymentItem(
      'item-pass',
      {
        revokeCount: 1,
        reason: '환불 승인',
      },
      {
        userId: 'admin-1',
        role: 'admin',
      },
    );

    expect(mockBillingRepo.updateEntitlement).toHaveBeenCalledWith(
      'entitlement-latest',
      expect.objectContaining({
        status: EntitlementStatus.CANCELED,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.updatePayment).toHaveBeenCalledWith(
      'payment-pass',
      expect.objectContaining({
        refundStatus: PaymentRefundStatus.PENDING,
        refundCompletedAt: null,
      }),
      expect.anything(),
    );
    expect(result.revokedEntitlements).toHaveLength(1);
    expect(result.payment.hasRevocation).toBe(true);
    expect(result.payment.revokedEntitlementCount).toBe(1);
  });

  it('active entitlement 회수는 allowActiveRevoke 없이는 막아야 한다', async () => {
    const activeEntitlement = {
      id: 'entitlement-active',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 1,
      status: EntitlementStatus.ACTIVE,
      startsAt: new Date('2026-03-24T00:00:00.000Z'),
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
      activatedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const paymentItem = {
      id: 'item-pass',
      paymentId: 'payment-pass',
      productTypeSnapshot: BillingProductType.PASS_SINGLE,
      payment: {
        id: 'payment-pass',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
      },
      entitlements: [activeEntitlement],
      creditBuckets: [],
      revocationHistories: [],
    };

    (mockBillingRepo.findPaymentItemById as jest.Mock)
      .mockResolvedValueOnce(paymentItem)
      .mockResolvedValueOnce(paymentItem);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: IncludedCreditPolicy.MONTHLY_AMOUNT,
        includedAvailable: IncludedCreditPolicy.MONTHLY_AMOUNT,
        rechargeAvailable: 0,
      },
      entitlements: [activeEntitlement],
      activeEntitlement,
    } as never);

    await expect(
      service.revokeEntitlementsByPaymentItem(
        'item-pass',
        {
          revokeCount: 1,
          reason: '환불 승인',
        },
        {
          userId: 'admin-1',
          role: 'admin',
        },
      ),
    ).rejects.toThrow(
      new ConflictException(BillingErrorCode.ACTIVE_REVOKE_CONFIRM_REQUIRED),
    );
  });

  it('active entitlement 회수 시 포함 크레딧을 함께 소멸시켜야 한다', async () => {
    const activeEntitlement = {
      id: 'entitlement-active',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 1,
      status: EntitlementStatus.ACTIVE,
      startsAt: new Date('2026-03-24T00:00:00.000Z'),
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
      activatedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const includedBucket = {
      id: 'bucket-included',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      entitlementId: 'entitlement-active',
      sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      remainingAmount: 600,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-04-23T14:59:59.999Z'),
    };
    const paymentItem = {
      id: 'item-pass',
      paymentId: 'payment-pass',
      productTypeSnapshot: BillingProductType.PASS_SINGLE,
      payment: {
        id: 'payment-pass',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
      },
      entitlements: [activeEntitlement],
      creditBuckets: [includedBucket],
      revocationHistories: [],
    };
    const entitlementHistory = {
      id: 'revoke-entitlement',
      paymentId: 'payment-pass',
      paymentItemId: 'item-pass',
      targetType: RevocationTargetType.ENTITLEMENT,
      targetId: activeEntitlement.id,
      actionType: RevocationActionType.CANCEL,
      fromStatus: EntitlementStatus.ACTIVE,
      toStatus: EntitlementStatus.CANCELED,
      deltaAmount: 0,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'batch-2',
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const bucketHistory = {
      id: 'revoke-bucket',
      paymentId: 'payment-pass',
      paymentItemId: 'item-pass',
      targetType: RevocationTargetType.CREDIT_BUCKET,
      targetId: includedBucket.id,
      actionType: RevocationActionType.CLAWBACK,
      fromStatus: CreditBucketStatus.ACTIVE,
      toStatus: CreditBucketStatus.CANCELED,
      deltaAmount: -600,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'batch-2',
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-pass',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      items: [
        {
          ...paymentItem,
          entitlements: [
            {
              ...activeEntitlement,
              status: EntitlementStatus.CANCELED,
              canceledAt: new Date('2026-03-24T00:00:00.000Z'),
            },
          ],
          creditBuckets: [
            {
              ...includedBucket,
              status: CreditBucketStatus.CANCELED,
              remainingAmount: 0,
            },
          ],
          revocationHistories: [bucketHistory, entitlementHistory],
        },
      ],
    };

    (mockBillingRepo.findPaymentItemById as jest.Mock)
      .mockResolvedValueOnce(paymentItem)
      .mockResolvedValueOnce(paymentItem);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 600,
        includedAvailable: 600,
        rechargeAvailable: 0,
      },
      entitlements: [activeEntitlement],
      activeEntitlement,
    } as never);
    (mockBillingRepo.updateEntitlement as jest.Mock).mockResolvedValue({
      ...activeEntitlement,
      status: EntitlementStatus.CANCELED,
      canceledAt: new Date('2026-03-24T00:00:00.000Z'),
    });
    (mockBillingRepo.createPaymentItemRevocationHistory as jest.Mock)
      .mockResolvedValueOnce(entitlementHistory)
      .mockResolvedValueOnce(bucketHistory);
    (
      mockBillingRepo.findIncludedCreditBucketByEntitlementId as jest.Mock
    ).mockResolvedValue(includedBucket);
    (mockBillingRepo.updateCreditBucket as jest.Mock).mockResolvedValue({
      ...includedBucket,
      status: CreditBucketStatus.CANCELED,
      remainingAmount: 0,
    });
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);

    const result = await service.revokeEntitlementsByPaymentItem(
      'item-pass',
      {
        revokeCount: 1,
        reason: '환불 승인',
        allowActiveRevoke: true,
      },
      {
        userId: 'admin-1',
        role: 'admin',
      },
    );

    expect(mockBillingRepo.updateCreditBucket).toHaveBeenCalledWith(
      'bucket-included',
      expect.objectContaining({
        status: CreditBucketStatus.CANCELED,
        remainingAmount: 0,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createCreditLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CreditLedgerType.ADJUST,
        deltaAmount: -600,
        referenceType: 'PAYMENT_ITEM_REVOCATION',
        referenceId: 'revoke-bucket',
      }),
      expect.anything(),
    );
    expect(result.payment.hasRevocation).toBe(true);
  });

  it('부분 사용된 충전권은 남은 양만 회수해야 한다', async () => {
    const rechargeBucket = {
      id: 'bucket-recharge',
      instructorId: 'instructor-1',
      paymentItemId: 'item-credit',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 3000,
      remainingAmount: 1800,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-06-22T14:59:59.999Z'),
    };
    const paymentItem = {
      id: 'item-credit',
      paymentId: 'payment-credit',
      productTypeSnapshot: BillingProductType.CREDIT_PACK,
      payment: {
        id: 'payment-credit',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
      },
      entitlements: [],
      creditBuckets: [rechargeBucket],
      revocationHistories: [],
    };
    const bucketHistory = {
      id: 'revoke-credit',
      paymentId: 'payment-credit',
      paymentItemId: 'item-credit',
      targetType: RevocationTargetType.CREDIT_BUCKET,
      targetId: rechargeBucket.id,
      actionType: RevocationActionType.CLAWBACK,
      fromStatus: CreditBucketStatus.ACTIVE,
      toStatus: CreditBucketStatus.CANCELED,
      deltaAmount: -1800,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'batch-3',
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-credit',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      items: [
        {
          ...paymentItem,
          entitlements: [],
          creditBuckets: [
            {
              ...rechargeBucket,
              status: CreditBucketStatus.CANCELED,
              remainingAmount: 0,
            },
          ],
          revocationHistories: [bucketHistory],
        },
      ],
    };

    (mockBillingRepo.findPaymentItemById as jest.Mock)
      .mockResolvedValueOnce(paymentItem)
      .mockResolvedValueOnce(paymentItem);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 1800,
        includedAvailable: 0,
        rechargeAvailable: 1800,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);
    (
      mockBillingRepo.findRechargeCreditBucketByPaymentItemId as jest.Mock
    ).mockResolvedValue(rechargeBucket);
    (
      mockBillingRepo.createPaymentItemRevocationHistory as jest.Mock
    ).mockResolvedValue(bucketHistory);
    (mockBillingRepo.updateCreditBucket as jest.Mock).mockResolvedValue({
      ...rechargeBucket,
      status: CreditBucketStatus.CANCELED,
      remainingAmount: 0,
    });
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);

    const result = await service.revokeRechargeCreditsByPaymentItem(
      'item-credit',
      {
        reason: '환불 승인',
      },
      {
        userId: 'admin-1',
        role: 'admin',
      },
    );

    expect(mockBillingRepo.updateCreditBucket).toHaveBeenCalledWith(
      'bucket-recharge',
      expect.objectContaining({
        status: CreditBucketStatus.CANCELED,
        remainingAmount: 0,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.createCreditLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        type: CreditLedgerType.ADJUST,
        deltaAmount: -1800,
      }),
      expect.anything(),
    );
    expect(mockBillingRepo.updatePayment).toHaveBeenCalledWith(
      'payment-credit',
      expect.objectContaining({
        refundStatus: PaymentRefundStatus.PENDING,
        refundCompletedAt: null,
      }),
      expect.anything(),
    );
    expect(result.revokedRechargeAmount).toBe(1800);
  });

  it('관리자 지급 충전권 회수 시 환불 대기로 바꾸지 않아야 한다', async () => {
    const rechargeBucket = {
      id: 'bucket-admin-recharge',
      instructorId: 'instructor-1',
      paymentItemId: 'item-admin-credit',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 1500,
      remainingAmount: 900,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-04-22T14:59:59.999Z'),
    };
    const paymentItem = {
      id: 'item-admin-credit',
      paymentId: 'payment-admin-credit',
      productCodeSnapshot: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
      productTypeSnapshot: BillingProductType.CREDIT_PACK,
      payment: {
        id: 'payment-admin-credit',
        instructorId: 'instructor-1',
        status: PaymentStatus.APPROVED,
      },
      entitlements: [],
      creditBuckets: [rechargeBucket],
      revocationHistories: [],
    };
    const bucketHistory = {
      id: 'revoke-admin-credit',
      paymentId: 'payment-admin-credit',
      paymentItemId: 'item-admin-credit',
      targetType: RevocationTargetType.CREDIT_BUCKET,
      targetId: rechargeBucket.id,
      actionType: RevocationActionType.CLAWBACK,
      fromStatus: CreditBucketStatus.ACTIVE,
      toStatus: CreditBucketStatus.CANCELED,
      deltaAmount: -900,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '오지급 회수',
      batchId: 'batch-admin-credit',
      createdAt: new Date('2026-03-24T00:00:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-admin-credit',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      totalAmount: 0,
      refundStatus: PaymentRefundStatus.NONE,
      items: [
        {
          ...paymentItem,
          creditBuckets: [
            {
              ...rechargeBucket,
              status: CreditBucketStatus.CANCELED,
              remainingAmount: 0,
            },
          ],
          revocationHistories: [bucketHistory],
        },
      ],
    };

    (mockBillingRepo.findPaymentItemById as jest.Mock)
      .mockResolvedValueOnce(paymentItem)
      .mockResolvedValueOnce(paymentItem);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 900,
        includedAvailable: 0,
        rechargeAvailable: 900,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);
    (
      mockBillingRepo.findRechargeCreditBucketByPaymentItemId as jest.Mock
    ).mockResolvedValue(rechargeBucket);
    (
      mockBillingRepo.createPaymentItemRevocationHistory as jest.Mock
    ).mockResolvedValue(bucketHistory);
    (mockBillingRepo.updateCreditBucket as jest.Mock).mockResolvedValue({
      ...rechargeBucket,
      status: CreditBucketStatus.CANCELED,
      remainingAmount: 0,
    });
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);

    await service.revokeRechargeCreditsByPaymentItem(
      'item-admin-credit',
      {
        reason: '오지급 회수',
      },
      {
        userId: 'admin-1',
        role: 'admin',
      },
    );

    expect(mockBillingRepo.updatePayment).not.toHaveBeenCalledWith(
      'payment-admin-credit',
      expect.objectContaining({
        refundStatus: PaymentRefundStatus.PENDING,
      }),
      expect.anything(),
    );
  });

  it('관리자 결제 상세 조회 시 회수된 이용권에 대한 환불 예상액만 계산해야 한다', async () => {
    const revokedActiveEntitlement = {
      id: 'entitlement-active-revoked',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 1,
      status: EntitlementStatus.CANCELED,
      startsAt: new Date('2026-03-24T00:00:00.000Z'),
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
      activatedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiredAt: null,
      canceledAt: new Date('2026-04-08T07:30:00.000Z'),
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const revokedQueuedEntitlement = {
      id: 'entitlement-queued-revoked',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 2,
      status: EntitlementStatus.CANCELED,
      startsAt: new Date('2026-04-23T15:00:00.000Z'),
      endsAt: new Date('2026-05-23T14:59:59.999Z'),
      activatedAt: null,
      expiredAt: null,
      canceledAt: new Date('2026-04-08T07:30:00.000Z'),
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const queuedEntitlement = {
      id: 'entitlement-queued-live',
      instructorId: 'instructor-1',
      paymentItemId: 'item-pass',
      sequenceNo: 3,
      status: EntitlementStatus.QUEUED,
      startsAt: new Date('2026-05-23T15:00:00.000Z'),
      endsAt: new Date('2026-06-23T14:59:59.999Z'),
      activatedAt: null,
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const revokedActiveHistory = {
      id: 'revoke-active-history',
      paymentId: 'payment-pass',
      paymentItemId: 'item-pass',
      targetType: RevocationTargetType.ENTITLEMENT,
      targetId: revokedActiveEntitlement.id,
      actionType: RevocationActionType.CANCEL,
      fromStatus: EntitlementStatus.ACTIVE,
      toStatus: EntitlementStatus.CANCELED,
      deltaAmount: 0,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'refund-batch-1',
      createdAt: new Date('2026-04-08T07:30:00.000Z'),
    };
    const revokedQueuedHistory = {
      id: 'revoke-queued-history',
      paymentId: 'payment-pass',
      paymentItemId: 'item-pass',
      targetType: RevocationTargetType.ENTITLEMENT,
      targetId: revokedQueuedEntitlement.id,
      actionType: RevocationActionType.CANCEL,
      fromStatus: EntitlementStatus.QUEUED,
      toStatus: EntitlementStatus.CANCELED,
      deltaAmount: 0,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'refund-batch-1',
      createdAt: new Date('2026-04-08T07:30:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-pass',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      items: [
        {
          id: 'item-pass',
          paymentId: 'payment-pass',
          productTypeSnapshot: BillingProductType.PASS_SINGLE,
          totalPrice: 300000,
          quantity: 3,
          rechargeCreditAmountSnapshot: 0,
          entitlements: [
            revokedActiveEntitlement,
            revokedQueuedEntitlement,
            queuedEntitlement,
          ],
          creditBuckets: [],
          revocationHistories: [revokedQueuedHistory, revokedActiveHistory],
        },
        {
          id: 'item-credit-live',
          paymentId: 'payment-pass',
          productTypeSnapshot: BillingProductType.CREDIT_PACK,
          totalPrice: 90000,
          quantity: 1,
          rechargeCreditAmountSnapshot: 3000,
          entitlements: [],
          creditBuckets: [],
          revocationHistories: [],
        },
      ],
      receiptRequest: null,
      statusHistory: [],
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [
        revokedActiveEntitlement,
        revokedQueuedEntitlement,
        queuedEntitlement,
      ],
      activeEntitlement: null,
    } as never);

    const result = await service.getPayment('payment-pass');

    expect(result.estimatedRefundAmount).toBe(150000);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        estimatedRefundAmount: 150000,
        refundBasis: 'REVOKED_ENTITLEMENT_DURATION_RATIO',
        refundBreakdown: expect.objectContaining({
          totalEntitlementCount: 3,
          revokedRefundWeight: 1.5,
        }),
      }),
    );
    expect(result.items[1]).not.toHaveProperty('estimatedRefundAmount');
  });

  it('관리자 결제 상세 조회 시 회수된 충전권에 대한 환불 예상액만 계산해야 한다', async () => {
    const rechargeBucket = {
      id: 'bucket-recharge',
      instructorId: 'instructor-1',
      paymentItemId: 'item-credit',
      entitlementId: null,
      sourceType: CreditSourceType.RECHARGE_PACK,
      status: CreditBucketStatus.CANCELED,
      originalAmount: 3000,
      remainingAmount: 0,
      grantedAt: new Date('2026-03-24T00:00:00.000Z'),
      expiresAt: new Date('2026-06-22T14:59:59.999Z'),
    };
    const rechargeHistory = {
      id: 'revoke-credit-history',
      paymentId: 'payment-credit',
      paymentItemId: 'item-credit',
      targetType: RevocationTargetType.CREDIT_BUCKET,
      targetId: 'bucket-recharge',
      actionType: RevocationActionType.CLAWBACK,
      fromStatus: CreditBucketStatus.ACTIVE,
      toStatus: CreditBucketStatus.CANCELED,
      deltaAmount: -2000,
      actorUserId: 'admin-1',
      actorRole: 'admin',
      reason: '환불 승인',
      batchId: 'refund-batch-2',
      createdAt: new Date('2026-03-30T00:00:00.000Z'),
    };
    const paymentDetail = {
      id: 'payment-credit',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      items: [
        {
          id: 'item-credit',
          paymentId: 'payment-credit',
          productTypeSnapshot: BillingProductType.CREDIT_PACK,
          totalPrice: 90000,
          quantity: 1,
          rechargeCreditAmountSnapshot: 3000,
          entitlements: [],
          creditBuckets: [rechargeBucket],
          revocationHistories: [rechargeHistory],
        },
      ],
      receiptRequest: null,
      statusHistory: [],
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(paymentDetail)
      .mockResolvedValueOnce(paymentDetail);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    const result = await service.getPayment('payment-credit');

    expect(result.estimatedRefundAmount).toBe(60000);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        estimatedRefundAmount: 60000,
        refundBasis: 'REVOKED_RECHARGE_RATIO',
        refundBreakdown: expect.objectContaining({
          originalAmount: 3000,
          usedAmount: 1000,
          revokedAmount: 2000,
          remainingAmount: 0,
          revokedRatio: 0.6667,
        }),
      }),
    );
  });

  it('관리자가 회수된 결제의 환불 상태를 완료로 변경할 수 있어야 한다', async () => {
    const revokedPayment = {
      id: 'payment-refund',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      refundStatus: PaymentRefundStatus.PENDING,
      items: [
        {
          id: 'item-refund',
          paymentId: 'payment-refund',
          productTypeSnapshot: BillingProductType.CREDIT_PACK,
          totalPrice: 90000,
          quantity: 1,
          rechargeCreditAmountSnapshot: 3000,
          entitlements: [],
          creditBuckets: [],
          revocationHistories: [
            {
              id: 'revoke-history',
              paymentId: 'payment-refund',
              paymentItemId: 'item-refund',
              targetType: RevocationTargetType.CREDIT_BUCKET,
              targetId: 'bucket-recharge',
              actionType: RevocationActionType.CLAWBACK,
              fromStatus: CreditBucketStatus.ACTIVE,
              toStatus: CreditBucketStatus.CANCELED,
              deltaAmount: -2000,
              actorUserId: 'admin-1',
              actorRole: 'admin',
              reason: '환불 승인',
              batchId: 'refund-batch-3',
              createdAt: new Date('2026-03-30T00:00:00.000Z'),
            },
          ],
        },
      ],
      receiptRequest: null,
      statusHistory: [],
    };
    const completedPayment = {
      ...revokedPayment,
      refundStatus: PaymentRefundStatus.COMPLETED,
      refundMemo: '계좌이체 환불 완료',
      refundCompletedAt: new Date('2026-03-24T00:00:00.000Z'),
    };

    (mockBillingRepo.findPaymentById as jest.Mock)
      .mockResolvedValueOnce(revokedPayment)
      .mockResolvedValueOnce(completedPayment)
      .mockResolvedValueOnce(completedPayment);
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    const result = await service.updatePaymentRefundStatus('payment-refund', {
      refundStatus: PaymentRefundStatus.COMPLETED,
      refundMemo: '계좌이체 환불 완료',
    });

    expect(mockBillingRepo.updatePayment).toHaveBeenCalledWith(
      'payment-refund',
      expect.objectContaining({
        refundStatus: PaymentRefundStatus.COMPLETED,
        refundMemo: '계좌이체 환불 완료',
        refundCompletedAt: expect.any(Date),
      }),
    );
    expect(result.refundStatus).toBe(PaymentRefundStatus.COMPLETED);
    expect(result.refundMemo).toBe('계좌이체 환불 완료');
  });

  it('관리자 지급 결제는 환불 상태 변경을 막아야 한다', async () => {
    const revokedAdminGrantPayment = {
      id: 'payment-admin-refund',
      instructorId: 'instructor-1',
      status: PaymentStatus.APPROVED,
      refundStatus: PaymentRefundStatus.NONE,
      items: [
        {
          id: 'item-admin-refund',
          paymentId: 'payment-admin-refund',
          productCodeSnapshot: BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
          productTypeSnapshot: BillingProductType.CREDIT_PACK,
          totalPrice: 0,
          quantity: 1,
          rechargeCreditAmountSnapshot: 1000,
          entitlements: [],
          creditBuckets: [],
          revocationHistories: [
            {
              id: 'revoke-history-admin-refund',
              paymentId: 'payment-admin-refund',
              paymentItemId: 'item-admin-refund',
              targetType: RevocationTargetType.CREDIT_BUCKET,
              targetId: 'bucket-admin-refund',
              actionType: RevocationActionType.CLAWBACK,
              fromStatus: CreditBucketStatus.ACTIVE,
              toStatus: CreditBucketStatus.CANCELED,
              deltaAmount: -1000,
              actorUserId: 'admin-1',
              actorRole: 'admin',
              reason: '오지급 회수',
              batchId: 'refund-batch-admin',
              createdAt: new Date('2026-03-30T00:00:00.000Z'),
            },
          ],
        },
      ],
      receiptRequest: null,
      statusHistory: [],
    };

    (mockBillingRepo.findPaymentById as jest.Mock).mockResolvedValue(
      revokedAdminGrantPayment,
    );

    await expect(
      service.updatePaymentRefundStatus('payment-admin-refund', {
        refundStatus: PaymentRefundStatus.COMPLETED,
        refundMemo: '처리 불가',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        '관리자 지급 크레딧은 환불 상태를 변경할 수 없습니다.',
      ),
    );
    expect(mockBillingRepo.updatePayment).not.toHaveBeenCalled();
  });

  it('활성 이용권이 있으면 billing summary와 mgmt 접근 상태가 같은 정산 결과를 기준으로 반환되어야 한다', async () => {
    const activeEntitlement = {
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

    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 700,
        includedAvailable: 500,
        rechargeAvailable: 200,
      },
      entitlements: [activeEntitlement],
      activeEntitlement,
    } as never);

    const summary = await service.getInstructorBillingSummary('instructor-1');
    const status = await service.getMgmtAccessStatus('instructor-1');

    expect(summary).toEqual({
      activeEntitlement: {
        id: 'entitlement-1',
        status: EntitlementStatus.ACTIVE,
        startsAt: new Date('2026-03-24T00:00:00.000Z'),
        endsAt: new Date('2026-04-23T14:59:59.999Z'),
        includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
      },
      creditSummary: {
        totalAvailable: 700,
      },
    });
    expect(status).toEqual({
      canAccess: true,
      reasonCode: null,
      activeEntitlement,
      wallet: {
        totalAvailable: 700,
        includedAvailable: 500,
        rechargeAvailable: 200,
      },
    });
  });

  it('활성 이용권이 없으면 billing summary는 null이고 mgmt 접근 상태는 차단되어야 한다', async () => {
    jest.spyOn(service, 'reconcileInstructorState').mockResolvedValue({
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
      entitlements: [],
      activeEntitlement: null,
    } as never);

    const summary = await service.getInstructorBillingSummary('instructor-1');
    const status = await service.getMgmtAccessStatus('instructor-1');

    expect(summary).toEqual({
      activeEntitlement: null,
      creditSummary: {
        totalAvailable: 0,
      },
    });
    expect(status).toEqual({
      canAccess: false,
      reasonCode: BillingErrorCode.PLAN_REQUIRED,
      activeEntitlement: null,
      wallet: {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
    });
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

  it('경계 시각에 만료된 활성 row는 스캔으로 정리하고 다음 queued 이용권을 활성화해야 한다', async () => {
    const now = new Date('2026-03-24T00:00:00.000Z');
    const expiredEntitlement = {
      id: 'entitlement-expired',
      instructorId: 'instructor-1',
      paymentItemId: 'item-expired',
      sequenceNo: 1,
      status: EntitlementStatus.ACTIVE,
      startsAt: new Date('2026-02-24T00:00:00.000Z'),
      endsAt: now,
      activatedAt: new Date('2026-02-24T00:00:00.000Z'),
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const queuedEntitlement = {
      id: 'entitlement-queued',
      instructorId: 'instructor-1',
      paymentItemId: 'item-queued',
      sequenceNo: 2,
      status: EntitlementStatus.QUEUED,
      startsAt: now,
      endsAt: new Date('2026-04-23T14:59:59.999Z'),
      activatedAt: null,
      expiredAt: null,
      canceledAt: null,
      includedCreditAmount: IncludedCreditPolicy.MONTHLY_AMOUNT,
    };
    const activatedEntitlement = {
      ...queuedEntitlement,
      status: EntitlementStatus.ACTIVE,
      activatedAt: now,
    };
    const expiringBucket = {
      id: 'bucket-expired',
      instructorId: 'instructor-1',
      paymentItemId: 'item-expired',
      entitlementId: 'entitlement-expired',
      sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: 300,
      remainingAmount: 100,
      grantedAt: new Date('2026-02-24T00:00:00.000Z'),
      expiresAt: now,
    };
    const wallet = {
      id: 'wallet-1',
      instructorId: 'instructor-1',
      totalAvailable: 0,
      includedAvailable: 0,
      rechargeAvailable: 0,
      lastReconciledAt: now,
    };

    (mockBillingRepo.listEntitlementsToExpire as jest.Mock)
      .mockResolvedValueOnce([expiredEntitlement])
      .mockResolvedValueOnce([]);
    (mockBillingRepo.findActiveEntitlement as jest.Mock)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(activatedEntitlement);
    (mockBillingRepo.findReadyQueuedEntitlement as jest.Mock).mockResolvedValue(
      queuedEntitlement,
    );
    (mockBillingRepo.listCreditBucketsToExpire as jest.Mock).mockResolvedValue([
      expiringBucket,
    ]);
    (mockBillingRepo.listActiveCreditBuckets as jest.Mock).mockResolvedValue(
      [],
    );
    (mockBillingRepo.upsertCreditWallet as jest.Mock).mockResolvedValue(wallet);
    (
      mockBillingRepo.listEntitlementsByInstructor as jest.Mock
    ).mockResolvedValue([
      {
        ...expiredEntitlement,
        status: EntitlementStatus.EXPIRED,
        expiredAt: now,
      },
      activatedEntitlement,
    ]);

    const expireEntitlementSpy = jest
      .spyOn(service as never, 'expireEntitlement' as never)
      .mockResolvedValue({
        ...expiredEntitlement,
        status: EntitlementStatus.EXPIRED,
        expiredAt: now,
      } as never);
    const activateEntitlementSpy = jest
      .spyOn(service as never, 'activateEntitlement' as never)
      .mockResolvedValue(activatedEntitlement as never);
    const expireCreditBucketSpy = jest
      .spyOn(service as never, 'expireCreditBucket' as never)
      .mockResolvedValue({
        ...expiringBucket,
        status: CreditBucketStatus.EXPIRED,
        remainingAmount: 0,
      } as never);

    const result = await service.reconcileInstructorState('instructor-1', now);

    expect(mockBillingRepo.listEntitlementsToExpire).toHaveBeenCalledWith(
      now,
      { instructorId: 'instructor-1' },
      expect.anything(),
    );
    expect(mockBillingRepo.findActiveEntitlement).toHaveBeenCalledWith(
      'instructor-1',
      now,
      expect.anything(),
    );
    expect(expireEntitlementSpy).toHaveBeenCalledWith(
      expiredEntitlement,
      now,
      expect.anything(),
    );
    expect(activateEntitlementSpy).toHaveBeenCalledWith(
      queuedEntitlement,
      now,
      expect.anything(),
    );
    expect(expireCreditBucketSpy).toHaveBeenCalledWith(
      expiringBucket,
      now,
      expect.anything(),
    );
    expect(result.activeEntitlement).toEqual(activatedEntitlement);
  });

  it('관리자 강사별 결제/이용권/크레딧 조회는 대상 강사가 없으면 실패해야 한다', async () => {
    (mockBillingRepo.findInstructorById as jest.Mock).mockResolvedValue(null);

    await expect(
      service.listInstructorPaymentsForAdmin('missing-instructor', {
        page: 1,
        limit: 20,
      }),
    ).rejects.toThrow(new NotFoundException('강사를 찾을 수 없습니다.'));

    await expect(
      service.listEntitlementsByInstructorForAdmin('missing-instructor'),
    ).rejects.toThrow(new NotFoundException('강사를 찾을 수 없습니다.'));

    await expect(
      service.getCreditSummaryForAdmin('missing-instructor'),
    ).rejects.toThrow(new NotFoundException('강사를 찾을 수 없습니다.'));
  });
});
