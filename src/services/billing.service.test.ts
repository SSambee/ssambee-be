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
  PaymentRefundStatus,
  PaymentStatus,
  RevocationActionType,
  RevocationTargetType,
} from '../constants/billing.constant.js';
import {
  ConflictException,
  ForbiddenException,
} from '../err/http.exception.js';

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
    expect(result.revokedRechargeAmount).toBe(1800);
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
