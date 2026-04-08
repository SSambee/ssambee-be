import { randomUUID } from 'node:crypto';
import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type {
  BillingProduct,
  CreditBucket,
  Entitlement,
  Payment,
  PaymentItem,
  PaymentItemRevocationHistory,
  PaymentReceiptRequest,
  PaymentStatusHistory,
} from '../generated/prisma/client.js';
import { BillingRepository } from '../repos/billing.repo.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../err/http.exception.js';
import type {
  CreateAdminCreditGrantDto,
  CreateBankTransferPaymentDto,
  CreateBillingProductDto,
  RevokeEntitlementsDto,
  UpdateBillingProductDto,
  UpdatePaymentRefundStatusDto,
} from '../validations/billing.validation.js';
import {
  BillingErrorCode,
  BillingMode,
  BillingProductType,
  BillingSystemProductCode,
  CreditBucketStatus,
  CreditLedgerType,
  CreditSourceType,
  EntitlementStatus,
  IncludedCreditPolicy,
  isExposedBillingProductType,
  PaymentMethodType,
  PaymentProviderType,
  PaymentRefundStatus,
  PaymentStatus,
  RevocationActionType,
  RevocationTargetType,
  ReceiptType,
} from '../constants/billing.constant.js';
import {
  calculateCreditExpiryAt,
  calculateMonthlyEntitlementEndAt,
  getNextEntitlementStartAt,
} from '../utils/date.util.js';
import {
  sendBankTransferApprovedMail,
  sendBankTransferDepositRequestMail,
  sendBankTransferRejectedMail,
} from '../utils/mail.util.js';

interface Actor {
  userId?: string;
  role?: string | null;
}

interface CreditMutationInput {
  instructorId: string;
  creditBucketId?: string | null;
  type: string;
  deltaAmount: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
}

interface RevocationHistoryInput {
  paymentId: string;
  paymentItemId: string;
  targetType: string;
  targetId: string;
  actionType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  deltaAmount?: number;
  actorUserId?: string;
  actorRole?: string | null;
  reason: string;
  batchId: string;
}

interface PaymentItemEstimatedRefund {
  estimatedRefundAmount: number;
  refundBasis: string;
  refundBreakdown: Record<string, unknown>;
}

interface PaymentNotificationTarget {
  id: string;
  methodType: string;
  totalAmount: number;
  depositorName?: string | null;
  depositorBankName?: string | null;
  instructor?: {
    user?: {
      email: string;
    };
  };
  items: Array<{
    productNameSnapshot: string;
    quantity: number;
  }>;
}

type PaymentItemWithRelations = PaymentItem & {
  billingProduct?: BillingProduct;
  entitlements?: Entitlement[];
  creditBuckets?: CreditBucket[];
  revocationHistories?: PaymentItemRevocationHistory[];
};

type PaymentWithRelations = Payment & {
  instructor?: {
    user?: {
      id: string;
      name: string;
      email: string;
    };
  };
  items: PaymentItemWithRelations[];
  receiptRequest?: PaymentReceiptRequest | null;
  statusHistory?: PaymentStatusHistory[];
};

const SERIALIZABLE_TRANSACTION_RETRY_LIMIT = 3;
const SERIALIZABLE_CONFLICT_ERROR_CODE = 'P2034';
const PAYMENT_STATUS_TRANSITION_CONFLICT_MESSAGE =
  '결제 상태가 변경되어 요청을 완료할 수 없습니다. 새로고침 후 다시 시도해주세요.';

export interface InstructorActiveEntitlementSummary {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  includedCreditAmount: number;
}

export interface PendingDepositEntitlementMarker {
  status: typeof PaymentStatus.PENDING_DEPOSIT;
}

export type SessionActiveEntitlementSummary =
  | InstructorActiveEntitlementSummary
  | PendingDepositEntitlementMarker;

export interface InstructorCreditSummary {
  totalAvailable: number;
}

export interface InstructorBillingSummary {
  activeEntitlement: InstructorActiveEntitlementSummary | null;
  creditSummary: InstructorCreditSummary;
}

interface InstructorBillingContext {
  wallet: {
    totalAvailable: number;
    includedAvailable: number;
    rechargeAvailable: number;
  };
  activeEntitlement: Entitlement | null;
  canAccess: boolean;
  reasonCode: (typeof BillingErrorCode)[keyof typeof BillingErrorCode] | null;
}

export class BillingService {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly prisma: PrismaClient,
  ) {}

  private isSerializableConflictError(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === SERIALIZABLE_CONFLICT_ERROR_CODE
    );
  }

  private async runSerializableTransactionWithRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    let attempt = 0;

    while (attempt < SERIALIZABLE_TRANSACTION_RETRY_LIMIT) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        attempt += 1;

        if (
          !this.isSerializableConflictError(error) ||
          attempt >= SERIALIZABLE_TRANSACTION_RETRY_LIMIT
        ) {
          throw error;
        }
      }
    }

    throw new Error('Serializable transaction retry loop exited unexpectedly.');
  }

  private async updatePaymentWithStatusGuard(
    paymentId: string,
    data: Prisma.PaymentUncheckedUpdateInput,
    expectedPreviousStatus: string,
    tx?: Prisma.TransactionClient,
  ) {
    const updatedPayment = await this.billingRepo.updatePayment(
      paymentId,
      data,
      tx,
      expectedPreviousStatus,
    );

    if (updatedPayment === null) {
      throw new ConflictException(PAYMENT_STATUS_TRANSITION_CONFLICT_MESSAGE);
    }

    return updatedPayment;
  }

  private sanitizeProductData(
    data: CreateBillingProductDto | UpdateBillingProductDto,
    current?: {
      productType: string;
      billingMode: string;
      paymentMethodType: string;
      durationMonths: number | null;
      includedCreditAmount: number;
      rechargeCreditAmount: number;
    },
  ) {
    const productType = data.productType ?? current?.productType;

    if (!productType) {
      throw new BadRequestException('상품 유형은 필수입니다.');
    }

    const sanitized = {
      ...data,
    } as Prisma.BillingProductUncheckedUpdateInput;

    if (productType === BillingProductType.PASS_SINGLE) {
      sanitized.billingMode = BillingMode.ONE_TIME;
      sanitized.durationMonths =
        data.durationMonths ?? current?.durationMonths ?? 1;
      sanitized.includedCreditAmount = IncludedCreditPolicy.MONTHLY_AMOUNT;
      sanitized.rechargeCreditAmount = 0;
    }

    if (productType === BillingProductType.CREDIT_PACK) {
      const rechargeAmount =
        data.rechargeCreditAmount ?? current?.rechargeCreditAmount ?? 0;

      if (rechargeAmount <= 0) {
        throw new BadRequestException(
          '크레딧 충전권은 충전 크레딧 수량이 필요합니다.',
        );
      }

      sanitized.billingMode = BillingMode.ONE_TIME;
      sanitized.durationMonths = null;
      sanitized.includedCreditAmount = 0;
      sanitized.rechargeCreditAmount = rechargeAmount;
    }

    return sanitized;
  }

  private assertBankTransferPurchasable(product: {
    isActive: boolean;
    paymentMethodType: string;
    productType: string;
  }) {
    if (!product.isActive) {
      throw new BadRequestException('비활성화된 상품입니다.');
    }

    if (product.paymentMethodType !== PaymentMethodType.BANK_TRANSFER) {
      throw new BadRequestException('현재는 무통장 결제만 지원합니다.');
    }

    if (
      product.productType !== BillingProductType.PASS_SINGLE &&
      product.productType !== BillingProductType.CREDIT_PACK
    ) {
      throw new BadRequestException('현재 구매할 수 없는 상품입니다.');
    }
  }

  private mapReceiptRequest(
    paymentId: string,
    receiptRequest?: CreateBankTransferPaymentDto['receiptRequest'],
  ): Prisma.PaymentReceiptRequestUncheckedCreateInput | null {
    if (!receiptRequest) {
      return null;
    }

    if (receiptRequest.type === ReceiptType.CASH_RECEIPT) {
      return {
        paymentId,
        type: receiptRequest.type,
        cashReceiptPhoneNumber: receiptRequest.phoneNumber,
      };
    }

    return {
      paymentId,
      type: receiptRequest.type,
      businessRegistrationNumber: receiptRequest.businessRegistrationNumber,
      businessName: receiptRequest.businessName,
      representativeName: receiptRequest.representativeName,
      taxInvoiceEmail: receiptRequest.taxInvoiceEmail,
      businessType: receiptRequest.businessType,
      businessCategory: receiptRequest.businessCategory,
      businessAddress: receiptRequest.businessAddress,
    };
  }

  private async refreshCreditWallet(
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const activeBuckets = await this.billingRepo.listActiveCreditBuckets(
      instructorId,
      tx,
    );

    const snapshot = activeBuckets.reduce(
      (acc, bucket) => {
        acc.totalAvailable += bucket.remainingAmount;

        if (bucket.sourceType === CreditSourceType.ENTITLEMENT_INCLUDED) {
          acc.includedAvailable += bucket.remainingAmount;
        }

        if (bucket.sourceType === CreditSourceType.RECHARGE_PACK) {
          acc.rechargeAvailable += bucket.remainingAmount;
        }

        return acc;
      },
      {
        totalAvailable: 0,
        includedAvailable: 0,
        rechargeAvailable: 0,
      },
    );

    await this.billingRepo.upsertCreditWallet(
      instructorId,
      {
        ...snapshot,
        lastReconciledAt: new Date(),
      },
      tx,
    );

    return snapshot;
  }

  private async appendCreditLedger(
    input: CreditMutationInput,
    tx?: Prisma.TransactionClient,
  ) {
    const snapshot = await this.refreshCreditWallet(input.instructorId, tx);

    await this.billingRepo.createCreditLedger(
      {
        instructorId: input.instructorId,
        creditBucketId: input.creditBucketId ?? null,
        type: input.type,
        deltaAmount: input.deltaAmount,
        balanceAfterTotal: snapshot.totalAvailable,
        balanceAfterIncluded: snapshot.includedAvailable,
        balanceAfterRecharge: snapshot.rechargeAvailable,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        reason: input.reason,
      },
      tx,
    );
  }

  private async appendRevocationHistory(
    input: RevocationHistoryInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.billingRepo.createPaymentItemRevocationHistory(
      {
        paymentId: input.paymentId,
        paymentItemId: input.paymentItemId,
        targetType: input.targetType,
        targetId: input.targetId,
        actionType: input.actionType,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus ?? null,
        deltaAmount: input.deltaAmount ?? 0,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        reason: input.reason,
        batchId: input.batchId,
      },
      tx,
    );
  }

  private getCreditBucketRevocationSummary(
    bucket: CreditBucket | null | undefined,
    histories: PaymentItemRevocationHistory[],
  ) {
    if (!bucket) {
      return {
        revokedAmount: 0,
        usedAmount: 0,
        remainingAmount: 0,
        lastRevokedAt: null,
      };
    }

    const bucketHistories = histories.filter(
      (history) =>
        history.targetType === RevocationTargetType.CREDIT_BUCKET &&
        history.targetId === bucket.id,
    );
    const revokedAmount = bucketHistories.reduce(
      (sum, history) => sum + Math.abs(Math.min(history.deltaAmount, 0)),
      0,
    );
    const lastRevokedAt = bucketHistories[0]?.createdAt ?? null;
    const usedAmount = Math.max(
      0,
      bucket.originalAmount - bucket.remainingAmount - revokedAmount,
    );

    return {
      revokedAmount,
      usedAmount,
      remainingAmount: bucket.remainingAmount,
      lastRevokedAt,
    };
  }

  private buildPaymentItemRevocationSummary(item: PaymentItemWithRelations) {
    const revocationHistories = item.revocationHistories ?? [];
    const revokedEntitlementIds = new Set(
      revocationHistories
        .filter(
          (history) =>
            history.targetType === RevocationTargetType.ENTITLEMENT &&
            history.actionType === RevocationActionType.CANCEL &&
            history.toStatus === EntitlementStatus.CANCELED,
        )
        .map((history) => history.targetId),
    );

    if (item.productTypeSnapshot === BillingProductType.PASS_SINGLE) {
      const entitlements = item.entitlements ?? [];
      const revocableQueuedCount = entitlements.filter(
        (entitlement) => entitlement.status === EntitlementStatus.QUEUED,
      ).length;
      const activeRevocable = entitlements.some(
        (entitlement) => entitlement.status === EntitlementStatus.ACTIVE,
      );

      return {
        revokedEntitlementCount: revokedEntitlementIds.size,
        revokedRechargeAmount: 0,
        revocableQueuedCount,
        activeRevocable,
        maxRevocableCount: revocableQueuedCount + (activeRevocable ? 1 : 0),
      };
    }

    if (item.productTypeSnapshot === BillingProductType.CREDIT_PACK) {
      const rechargeBucket =
        item.creditBuckets?.find(
          (bucket) => bucket.sourceType === CreditSourceType.RECHARGE_PACK,
        ) ?? null;
      const rechargeSummary = this.getCreditBucketRevocationSummary(
        rechargeBucket,
        revocationHistories,
      );

      return {
        revokedEntitlementCount: 0,
        revokedRechargeAmount: rechargeSummary.revokedAmount,
        rechargeOriginalAmount: rechargeBucket?.originalAmount ?? 0,
        rechargeConsumedAmount: rechargeSummary.usedAmount,
        rechargeRemainingAmount: rechargeSummary.remainingAmount,
        rechargeRevocable:
          rechargeBucket?.status === CreditBucketStatus.ACTIVE &&
          rechargeBucket.remainingAmount > 0,
        lastRevokedAt: rechargeSummary.lastRevokedAt,
      };
    }

    return {
      revokedEntitlementCount: 0,
      revokedRechargeAmount: 0,
    };
  }

  private clampRatio(value: number) {
    if (!Number.isFinite(value)) {
      return 0;
    }

    return Number(Math.min(1, Math.max(0, value)).toFixed(4));
  }

  private calculateRevokedEntitlementRefundRatio(
    entitlement: Entitlement,
    history: PaymentItemRevocationHistory,
  ) {
    if (history.fromStatus === EntitlementStatus.QUEUED) {
      return 1;
    }

    if (history.fromStatus !== EntitlementStatus.ACTIVE) {
      return 0;
    }

    const totalDuration =
      entitlement.endsAt.getTime() - entitlement.startsAt.getTime();

    if (totalDuration <= 0) {
      return 0;
    }

    const remainingDuration =
      entitlement.endsAt.getTime() - history.createdAt.getTime();

    return this.clampRatio(remainingDuration / totalDuration);
  }

  private calculatePaymentItemEstimatedRefund(
    item: PaymentItemWithRelations,
  ): PaymentItemEstimatedRefund | null {
    const revocationHistories = item.revocationHistories ?? [];

    if (revocationHistories.length === 0) {
      return null;
    }

    if (item.productTypeSnapshot === BillingProductType.PASS_SINGLE) {
      const entitlements = item.entitlements ?? [];
      const totalEntitlementCount = entitlements.length;

      if (totalEntitlementCount === 0) {
        return null;
      }

      const revokedEntitlements = revocationHistories
        .filter(
          (history) =>
            history.targetType === RevocationTargetType.ENTITLEMENT &&
            history.actionType === RevocationActionType.CANCEL &&
            history.toStatus === EntitlementStatus.CANCELED,
        )
        .map((history) => {
          const entitlement = entitlements.find(
            (candidate) => candidate.id === history.targetId,
          );

          if (!entitlement) {
            return null;
          }

          return {
            entitlementId: entitlement.id,
            revokedFromStatus: history.fromStatus,
            refundRatio: this.calculateRevokedEntitlementRefundRatio(
              entitlement,
              history,
            ),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (revokedEntitlements.length === 0) {
        return null;
      }

      const revokedRefundWeight = Number(
        revokedEntitlements
          .reduce((sum, entry) => sum + entry.refundRatio, 0)
          .toFixed(4),
      );

      return {
        estimatedRefundAmount: Math.floor(
          (item.totalPrice * revokedRefundWeight) / totalEntitlementCount,
        ),
        refundBasis: 'REVOKED_ENTITLEMENT_DURATION_RATIO',
        refundBreakdown: {
          totalEntitlementCount,
          revokedRefundWeight,
          revokedEntitlements,
        },
      };
    }

    if (item.productTypeSnapshot === BillingProductType.CREDIT_PACK) {
      const rechargeBucket =
        item.creditBuckets?.find(
          (bucket) => bucket.sourceType === CreditSourceType.RECHARGE_PACK,
        ) ?? null;
      const revokedAmount = revocationHistories
        .filter(
          (history) =>
            history.targetType === RevocationTargetType.CREDIT_BUCKET &&
            history.actionType === RevocationActionType.CLAWBACK,
        )
        .reduce(
          (sum, history) => sum + Math.abs(Math.min(history.deltaAmount, 0)),
          0,
        );

      if (revokedAmount === 0) {
        return null;
      }

      const originalAmount =
        rechargeBucket?.originalAmount ??
        item.rechargeCreditAmountSnapshot * item.quantity;
      const remainingAmount = rechargeBucket?.remainingAmount ?? 0;

      if (originalAmount <= 0) {
        return null;
      }

      const revokedRatio = this.clampRatio(revokedAmount / originalAmount);
      const usedAmount = Math.max(
        0,
        originalAmount - remainingAmount - revokedAmount,
      );

      return {
        estimatedRefundAmount: Math.floor(
          item.totalPrice * (revokedAmount / originalAmount),
        ),
        refundBasis: 'REVOKED_RECHARGE_RATIO',
        refundBreakdown: {
          originalAmount,
          usedAmount,
          revokedAmount,
          remainingAmount,
          revokedRatio,
        },
      };
    }

    return null;
  }

  private async markPaymentRefundPending(
    paymentId: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.billingRepo.updatePayment(
      paymentId,
      {
        refundStatus: PaymentRefundStatus.PENDING,
        refundCompletedAt: null,
      },
      tx,
    );
  }

  private resolveRefundReason(refundMemo?: string) {
    const trimmedMemo = refundMemo?.trim();

    return trimmedMemo && trimmedMemo.length > 0 ? trimmedMemo : '환불 처리';
  }

  private async revokeRechargeCreditsForRefund(
    payment: PaymentWithRelations,
    actor: Actor,
    reason: string,
    tx: Prisma.TransactionClient,
  ) {
    const batchId = randomUUID();
    let revokedAny = false;

    for (const item of payment.items) {
      if (item.productTypeSnapshot !== BillingProductType.CREDIT_PACK) {
        continue;
      }

      const rechargeBucket =
        await this.billingRepo.findRechargeCreditBucketByPaymentItemId(
          item.id,
          tx,
        );

      if (
        !rechargeBucket ||
        rechargeBucket.status !== CreditBucketStatus.ACTIVE ||
        rechargeBucket.remainingAmount <= 0
      ) {
        continue;
      }

      const revokedAmount = rechargeBucket.remainingAmount;
      const canceledBucket = await this.billingRepo.updateCreditBucket(
        rechargeBucket.id,
        {
          status: CreditBucketStatus.CANCELED,
          remainingAmount: 0,
        },
        tx,
      );
      const history = await this.appendRevocationHistory(
        {
          paymentId: payment.id,
          paymentItemId: item.id,
          targetType: RevocationTargetType.CREDIT_BUCKET,
          targetId: rechargeBucket.id,
          actionType: RevocationActionType.CLAWBACK,
          fromStatus: rechargeBucket.status,
          toStatus: CreditBucketStatus.CANCELED,
          deltaAmount: -revokedAmount,
          actorUserId: actor.userId,
          actorRole: actor.role,
          reason,
          batchId,
        },
        tx,
      );

      await this.appendCreditLedger(
        {
          instructorId: payment.instructorId,
          creditBucketId: canceledBucket.id,
          type: CreditLedgerType.ADJUST,
          deltaAmount: -revokedAmount,
          referenceType: 'PAYMENT_ITEM_REVOCATION',
          referenceId: history.id,
          reason,
        },
        tx,
      );

      revokedAny = true;
    }

    return revokedAny;
  }

  private getRechargeCreditExpiryDays(item: PaymentItem) {
    return (
      item.rechargeExpiresInDaysSnapshot ??
      IncludedCreditPolicy.RECHARGE_EXPIRES_IN_DAYS
    );
  }

  private formatPayment(
    payment: PaymentWithRelations,
    options?: {
      includeAdminRevocationHistories?: boolean;
      includeEstimatedRefund?: boolean;
    },
  ) {
    const items = payment.items.map((item) => {
      const { revocationHistories, ...restItem } = item;
      const revocationSummary = this.buildPaymentItemRevocationSummary(item);
      const estimatedRefund = options?.includeEstimatedRefund
        ? this.calculatePaymentItemEstimatedRefund(item)
        : null;

      return {
        ...restItem,
        ...(options?.includeAdminRevocationHistories
          ? {
              revocationHistories: revocationHistories ?? [],
            }
          : {}),
        ...(estimatedRefund ?? {}),
        revocationSummary,
      };
    });

    const revokedEntitlementCount = items.reduce(
      (sum, item) =>
        sum + (item.revocationSummary.revokedEntitlementCount ?? 0),
      0,
    );
    const revokedRechargeAmount = items.reduce(
      (sum, item) => sum + (item.revocationSummary.revokedRechargeAmount ?? 0),
      0,
    );
    const hasEstimatedRefund = items.some(
      (item) => typeof item.estimatedRefundAmount === 'number',
    );
    const estimatedRefundAmount = options?.includeEstimatedRefund
      ? items.reduce((sum, item) => sum + (item.estimatedRefundAmount ?? 0), 0)
      : null;

    return {
      ...payment,
      items,
      hasRevocation: revokedEntitlementCount > 0 || revokedRechargeAmount > 0,
      revokedEntitlementCount,
      revokedRechargeAmount,
      ...(options?.includeEstimatedRefund && hasEstimatedRefund
        ? { estimatedRefundAmount: estimatedRefundAmount ?? 0 }
        : {}),
    };
  }

  private async grantIncludedCreditsForEntitlement(
    entitlement: Entitlement,
    tx?: Prisma.TransactionClient,
  ) {
    const existing =
      await this.billingRepo.findIncludedCreditBucketByEntitlementId(
        entitlement.id,
        tx,
      );

    if (existing) {
      return existing;
    }

    const bucket = await this.billingRepo.upsertIncludedCreditBucket(
      {
        instructorId: entitlement.instructorId,
        paymentItemId: entitlement.paymentItemId,
        entitlementId: entitlement.id,
        sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
        status: CreditBucketStatus.ACTIVE,
        originalAmount: entitlement.includedCreditAmount,
        remainingAmount: entitlement.includedCreditAmount,
        grantedAt: entitlement.activatedAt ?? new Date(),
        expiresAt: entitlement.endsAt,
      },
      tx,
    );

    await this.appendCreditLedger(
      {
        instructorId: entitlement.instructorId,
        creditBucketId: bucket.id,
        type: CreditLedgerType.GRANT,
        deltaAmount: entitlement.includedCreditAmount,
        referenceType: 'ENTITLEMENT',
        referenceId: entitlement.id,
        reason: '이용권 기본 크레딧 지급',
      },
      tx,
    );

    return bucket;
  }

  private async grantRechargeCredits(
    payment: Payment,
    item: PaymentItem,
    tx?: Prisma.TransactionClient,
  ) {
    const existing =
      await this.billingRepo.findRechargeCreditBucketByPaymentItemId(
        item.id,
        tx,
      );

    if (existing) {
      return existing;
    }

    const totalRechargeAmount =
      item.rechargeCreditAmountSnapshot * item.quantity;

    if (totalRechargeAmount <= 0) {
      return null;
    }

    const bucket = await this.billingRepo.upsertRechargeCreditBucket(
      {
        instructorId: payment.instructorId,
        paymentItemId: item.id,
        entitlementId: null,
        sourceType: CreditSourceType.RECHARGE_PACK,
        status: CreditBucketStatus.ACTIVE,
        originalAmount: totalRechargeAmount,
        remainingAmount: totalRechargeAmount,
        grantedAt: payment.approvedAt ?? new Date(),
        expiresAt: calculateCreditExpiryAt(
          payment.approvedAt ?? new Date(),
          this.getRechargeCreditExpiryDays(item),
        ),
      },
      tx,
    );

    await this.appendCreditLedger(
      {
        instructorId: payment.instructorId,
        creditBucketId: bucket.id,
        type: CreditLedgerType.GRANT,
        deltaAmount: totalRechargeAmount,
        referenceType: 'PAYMENT_ITEM',
        referenceId: item.id,
        reason: '충전권 크레딧 지급',
      },
      tx,
    );

    return bucket;
  }

  private async activateEntitlement(
    entitlement: Entitlement,
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const activated = await this.billingRepo.updateEntitlement(
      entitlement.id,
      {
        status: EntitlementStatus.ACTIVE,
        activatedAt: now,
      },
      tx,
    );

    await this.grantIncludedCreditsForEntitlement(activated, tx);

    return activated;
  }

  private async expireEntitlement(
    entitlement: Entitlement,
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    return this.billingRepo.updateEntitlement(
      entitlement.id,
      {
        status: EntitlementStatus.EXPIRED,
        expiredAt: now,
      },
      tx,
    );
  }

  private async expireCreditBucket(
    bucket: CreditBucket,
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    if (bucket.status !== CreditBucketStatus.ACTIVE) {
      return bucket;
    }

    const deltaAmount =
      bucket.remainingAmount > 0 ? -bucket.remainingAmount : 0;

    const expiredBucket = await this.billingRepo.updateCreditBucket(
      bucket.id,
      {
        status: CreditBucketStatus.EXPIRED,
        remainingAmount: 0,
      },
      tx,
    );

    if (deltaAmount !== 0) {
      await this.appendCreditLedger(
        {
          instructorId: bucket.instructorId,
          creditBucketId: bucket.id,
          type: CreditLedgerType.EXPIRE,
          deltaAmount,
          referenceType: 'CREDIT_BUCKET',
          referenceId: bucket.id,
          reason: now >= bucket.expiresAt ? '크레딧 만료' : '이용권 만료',
        },
        tx,
      );
    } else {
      await this.refreshCreditWallet(bucket.instructorId, tx);
    }

    return expiredBucket;
  }

  private async provisionPassEntitlements(
    instructorId: string,
    item: PaymentItem,
    now: Date,
    tx?: Prisma.TransactionClient,
  ) {
    const totalEntitlementCount =
      (item.durationMonthsSnapshot ?? 1) * item.quantity;
    const latestEntitlement = await this.billingRepo.findLatestEntitlement(
      instructorId,
      tx,
    );

    let cursorStartAt = latestEntitlement
      ? getNextEntitlementStartAt(latestEntitlement.endsAt)
      : now;
    let shouldActivateImmediately = !latestEntitlement;

    for (
      let sequenceNo = 1;
      sequenceNo <= totalEntitlementCount;
      sequenceNo += 1
    ) {
      const startsAt = cursorStartAt;
      const endsAt = calculateMonthlyEntitlementEndAt(startsAt, 1);
      const entitlement = await this.billingRepo.createEntitlement(
        {
          instructorId,
          paymentItemId: item.id,
          sequenceNo,
          status: shouldActivateImmediately
            ? EntitlementStatus.ACTIVE
            : EntitlementStatus.QUEUED,
          startsAt,
          endsAt,
          activatedAt: shouldActivateImmediately ? now : null,
          includedCreditAmount:
            item.includedCreditAmountSnapshot ||
            IncludedCreditPolicy.MONTHLY_AMOUNT,
        },
        tx,
      );

      if (shouldActivateImmediately) {
        await this.grantIncludedCreditsForEntitlement(entitlement, tx);
      }

      cursorStartAt = getNextEntitlementStartAt(endsAt);
      shouldActivateImmediately = false;
    }
  }

  private async assertInstructorPaymentOwner(
    paymentId: string,
    instructorId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const payment = await this.billingRepo.findPaymentById(paymentId, tx);

    if (!payment) {
      throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    }

    if (payment.instructorId !== instructorId) {
      throw new ForbiddenException('본인의 결제만 조회할 수 있습니다.');
    }

    return payment;
  }

  private async assertRevocablePaymentItem(
    paymentItemId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const paymentItem = await this.billingRepo.findPaymentItemById(
      paymentItemId,
      tx,
    );

    if (!paymentItem) {
      throw new NotFoundException('결제 상품 정보를 찾을 수 없습니다.');
    }

    if (paymentItem.payment.status !== PaymentStatus.APPROVED) {
      throw new BadRequestException('승인된 결제 상품만 회수할 수 있습니다.');
    }

    return paymentItem;
  }

  private getPaymentNotificationRecipient(
    payment: PaymentNotificationTarget,
  ): string | null {
    const email = payment.instructor?.user?.email?.trim();

    return email && email.length > 0 ? email : null;
  }

  private getPaymentProductName(payment: PaymentNotificationTarget) {
    const item = payment.items[0];

    if (!item) {
      return '결제 상품';
    }

    return item.quantity > 1
      ? `${item.productNameSnapshot} 외 ${item.quantity - 1}건`
      : item.productNameSnapshot;
  }

  private logPaymentMailSkipped(
    payment: PaymentNotificationTarget,
    event: 'deposit_request' | 'approved' | 'rejected',
  ) {
    console.warn('[BillingService] payment mail skipped: recipient missing', {
      paymentId: payment.id,
      event,
    });
  }

  private async runPaymentMailSideEffect(
    paymentId: string,
    event: 'deposit_request' | 'approved' | 'rejected',
    operation: () => Promise<void>,
  ) {
    try {
      await operation();
    } catch (error) {
      console.error('[BillingService] payment mail dispatch failed', {
        paymentId,
        event,
        error,
      });
    }
  }

  private async notifyBankTransferDepositRequest(
    payment: PaymentNotificationTarget,
  ) {
    const recipient = this.getPaymentNotificationRecipient(payment);

    if (!recipient) {
      this.logPaymentMailSkipped(payment, 'deposit_request');
      return;
    }

    await this.runPaymentMailSideEffect(payment.id, 'deposit_request', () =>
      sendBankTransferDepositRequestMail({
        email: recipient,
        productName: this.getPaymentProductName(payment),
        totalAmount: payment.totalAmount,
        depositorName: payment.depositorName ?? '미입력',
        depositorBankName: payment.depositorBankName ?? '미입력',
      }),
    );
  }

  private async notifyBankTransferApproved(payment: PaymentNotificationTarget) {
    if (payment.methodType !== PaymentMethodType.BANK_TRANSFER) {
      return;
    }

    const recipient = this.getPaymentNotificationRecipient(payment);

    if (!recipient) {
      this.logPaymentMailSkipped(payment, 'approved');
      return;
    }

    await this.runPaymentMailSideEffect(payment.id, 'approved', () =>
      sendBankTransferApprovedMail({
        email: recipient,
        productName: this.getPaymentProductName(payment),
        totalAmount: payment.totalAmount,
      }),
    );
  }

  private async notifyBankTransferRejected(
    payment: PaymentNotificationTarget,
    reason: string,
  ) {
    if (payment.methodType !== PaymentMethodType.BANK_TRANSFER) {
      return;
    }

    const recipient = this.getPaymentNotificationRecipient(payment);

    if (!recipient) {
      this.logPaymentMailSkipped(payment, 'rejected');
      return;
    }

    await this.runPaymentMailSideEffect(payment.id, 'rejected', () =>
      sendBankTransferRejectedMail({
        email: recipient,
        productName: this.getPaymentProductName(payment),
        totalAmount: payment.totalAmount,
        reason,
      }),
    );
  }

  async listActiveProducts() {
    const products = await this.billingRepo.listActiveProducts();

    return products.filter(
      (product) =>
        product.paymentMethodType === PaymentMethodType.BANK_TRANSFER &&
        isExposedBillingProductType(product.productType),
    );
  }

  async listProducts() {
    return this.billingRepo.listProducts();
  }

  async createProduct(data: CreateBillingProductDto) {
    try {
      return await this.billingRepo.createProduct(
        this.sanitizeProductData(
          data,
        ) as Prisma.BillingProductUncheckedCreateInput,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 상품 코드입니다.');
      }

      throw error;
    }
  }

  async updateProduct(id: string, data: UpdateBillingProductDto) {
    const product = await this.billingRepo.findProductById(id);

    if (!product) {
      throw new NotFoundException('상품을 찾을 수 없습니다.');
    }

    try {
      return await this.billingRepo.updateProduct(
        id,
        this.sanitizeProductData(data, product),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('이미 존재하는 상품 코드입니다.');
      }

      throw error;
    }
  }

  async createAdminCreditGrant(
    instructorId: string,
    data: CreateAdminCreditGrantDto,
    actor: Actor,
  ) {
    const [instructor, product] = await Promise.all([
      this.billingRepo.findInstructorById(instructorId),
      this.billingRepo.findProductByCode(
        BillingSystemProductCode.ADMIN_CREDIT_GRANT_ZERO,
      ),
    ]);

    if (!instructor) {
      throw new NotFoundException('강사를 찾을 수 없습니다.');
    }

    if (!product) {
      throw new NotFoundException('관리자 지급용 상품을 찾을 수 없습니다.');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const createdPayment = await this.billingRepo.createPayment(
        {
          instructorId,
          methodType: PaymentMethodType.BANK_TRANSFER,
          providerType: PaymentProviderType.MANUAL,
          status: PaymentStatus.APPROVED,
          totalAmount: 0,
          approvedAt,
        },
        tx,
      );

      const createdItem = await this.billingRepo.createPaymentItem(
        {
          paymentId: createdPayment.id,
          billingProductId: product.id,
          productCodeSnapshot: product.code,
          productNameSnapshot: product.name,
          productTypeSnapshot: product.productType,
          quantity: 1,
          unitPrice: 0,
          totalPrice: 0,
          durationMonthsSnapshot: product.durationMonths,
          includedCreditAmountSnapshot: 0,
          rechargeCreditAmountSnapshot: data.creditAmount,
          rechargeExpiresInDaysSnapshot: data.expiresInDays,
        },
        tx,
      );

      await this.billingRepo.createPaymentStatusHistory(
        {
          paymentId: createdPayment.id,
          fromStatus: null,
          toStatus: PaymentStatus.APPROVED,
          actorUserId: actor.userId,
          actorRole: actor.role,
          reason: data.reason,
        },
        tx,
      );

      await this.grantRechargeCredits(createdPayment, createdItem, tx);

      return createdPayment;
    });

    return this.getPayment(payment.id);
  }

  async createBankTransferPayment(
    instructorId: string,
    data: CreateBankTransferPaymentDto,
    actor: Actor,
  ) {
    const product = await this.billingRepo.findProductById(data.productId);

    if (!product) {
      throw new NotFoundException('상품을 찾을 수 없습니다.');
    }

    this.assertBankTransferPurchasable(product);

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await this.billingRepo.createPayment(
        {
          instructorId,
          methodType: PaymentMethodType.BANK_TRANSFER,
          providerType: PaymentProviderType.MANUAL,
          status: PaymentStatus.PENDING_DEPOSIT,
          depositorName: data.depositorName,
          depositorBankName: data.depositorBankName,
          totalAmount: product.price * data.quantity,
        },
        tx,
      );

      await this.billingRepo.createPaymentItem(
        {
          paymentId: createdPayment.id,
          billingProductId: product.id,
          productCodeSnapshot: product.code,
          productNameSnapshot: product.name,
          productTypeSnapshot: product.productType,
          quantity: data.quantity,
          unitPrice: product.price,
          totalPrice: product.price * data.quantity,
          durationMonthsSnapshot: product.durationMonths,
          includedCreditAmountSnapshot: product.includedCreditAmount,
          rechargeCreditAmountSnapshot: product.rechargeCreditAmount,
        },
        tx,
      );

      await this.billingRepo.createPaymentStatusHistory(
        {
          paymentId: createdPayment.id,
          fromStatus: null,
          toStatus: PaymentStatus.PENDING_DEPOSIT,
          actorUserId: actor.userId,
          actorRole: actor.role,
        },
        tx,
      );

      const receiptRequest = this.mapReceiptRequest(
        createdPayment.id,
        data.receiptRequest,
      );
      if (receiptRequest) {
        await this.billingRepo.createReceiptRequest(receiptRequest, tx);
      }

      return createdPayment;
    });

    const paymentDetail = await this.getInstructorPayment(
      payment.id,
      instructorId,
    );

    await this.notifyBankTransferDepositRequest(
      paymentDetail as PaymentNotificationTarget,
    );

    return paymentDetail;
  }

  async listInstructorPayments(
    instructorId: string,
    query: { status?: string; page: number; limit: number },
  ) {
    const result = await this.billingRepo.listInstructorPayments(
      instructorId,
      query,
    );

    return {
      ...result,
      payments: result.payments.map((payment) =>
        this.formatPayment(payment as PaymentWithRelations),
      ),
    };
  }

  async listPayments(query: { status?: string; page: number; limit: number }) {
    const result = await this.billingRepo.listPayments(query);

    return {
      ...result,
      payments: result.payments.map((payment) =>
        this.formatPayment(payment as PaymentWithRelations, {
          includeAdminRevocationHistories: true,
        }),
      ),
    };
  }

  async listInstructorPaymentsForAdmin(
    instructorId: string,
    query: { status?: string; page: number; limit: number },
  ) {
    await this.assertInstructorExists(instructorId);

    return this.listInstructorPayments(instructorId, query);
  }

  async getInstructorPayment(paymentId: string, instructorId: string) {
    const payment = await this.assertInstructorPaymentOwner(
      paymentId,
      instructorId,
    );

    return this.formatPayment(payment as PaymentWithRelations);
  }

  async getPayment(paymentId: string) {
    const payment = await this.billingRepo.findPaymentById(paymentId);

    if (!payment) {
      throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    }

    await this.reconcileInstructorState(payment.instructorId);

    const refreshedPayment = await this.billingRepo.findPaymentById(paymentId);

    if (!refreshedPayment) {
      throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    }

    return this.formatPayment(refreshedPayment as PaymentWithRelations, {
      includeAdminRevocationHistories: true,
      includeEstimatedRefund: true,
    });
  }

  async approvePayment(paymentId: string, actor: Actor, memo?: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.billingRepo.findPaymentById(paymentId, tx);

      if (!payment) {
        throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
      }

      if (payment.status !== PaymentStatus.PENDING_DEPOSIT) {
        throw new BadRequestException(
          '입금 대기 상태에서만 결제 승인이 가능합니다.',
        );
      }

      const approvedAt = new Date();

      await this.updatePaymentWithStatusGuard(
        paymentId,
        {
          status: PaymentStatus.APPROVED,
          depositedAt: payment.depositedAt ?? approvedAt,
          approvedAt,
        },
        payment.status,
        tx,
      );

      await this.billingRepo.createPaymentStatusHistory(
        {
          paymentId,
          fromStatus: payment.status,
          toStatus: PaymentStatus.APPROVED,
          actorUserId: actor.userId,
          actorRole: actor.role,
          reason: memo,
        },
        tx,
      );

      for (const item of payment.items) {
        if (item.productTypeSnapshot === BillingProductType.PASS_SINGLE) {
          await this.provisionPassEntitlements(
            payment.instructorId,
            item,
            approvedAt,
            tx,
          );
        }

        if (item.productTypeSnapshot === BillingProductType.CREDIT_PACK) {
          await this.grantRechargeCredits(
            {
              ...payment,
              approvedAt,
            },
            item,
            tx,
          );
        }
      }

      await this.refreshCreditWallet(payment.instructorId, tx);
    });

    const paymentDetail = await this.getPayment(paymentId);

    await this.notifyBankTransferApproved(
      paymentDetail as PaymentNotificationTarget,
    );

    return paymentDetail;
  }

  async rejectPayment(paymentId: string, actor: Actor, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.billingRepo.findPaymentById(paymentId, tx);

      if (!payment) {
        throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
      }

      if (payment.status !== PaymentStatus.PENDING_DEPOSIT) {
        throw new BadRequestException(
          '입금 대기 상태에서만 결제 반려가 가능합니다.',
        );
      }

      await this.updatePaymentWithStatusGuard(
        paymentId,
        {
          status: PaymentStatus.REJECTED,
          rejectedAt: new Date(),
        },
        payment.status,
        tx,
      );

      await this.billingRepo.createPaymentStatusHistory(
        {
          paymentId,
          fromStatus: payment.status,
          toStatus: PaymentStatus.REJECTED,
          actorUserId: actor.userId,
          actorRole: actor.role,
          reason,
        },
        tx,
      );
    });

    const paymentDetail = await this.getPayment(paymentId);

    await this.notifyBankTransferRejected(
      paymentDetail as PaymentNotificationTarget,
      reason,
    );

    return paymentDetail;
  }

  async updatePaymentRefundStatus(
    paymentId: string,
    data: UpdatePaymentRefundStatusDto,
    actor: Actor = {},
  ) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.billingRepo.findPaymentById(paymentId, tx);

      if (!payment) {
        throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
      }

      const hasRevocation = payment.items.some(
        (item) => (item.revocationHistories?.length ?? 0) > 0,
      );
      const revokedRechargeCredits = await this.revokeRechargeCreditsForRefund(
        payment as PaymentWithRelations,
        actor,
        this.resolveRefundReason(data.refundMemo),
        tx,
      );

      if (!hasRevocation && !revokedRechargeCredits) {
        throw new BadRequestException(
          '회수 이력이 있는 결제만 환불 상태를 변경할 수 있습니다.',
        );
      }

      await this.billingRepo.updatePayment(
        paymentId,
        {
          refundStatus: data.refundStatus,
          refundMemo: data.refundMemo,
          refundCompletedAt:
            data.refundStatus === PaymentRefundStatus.COMPLETED
              ? new Date()
              : null,
        },
        tx,
      );
    });

    return this.getPayment(paymentId);
  }

  async revokeEntitlementsByPaymentItem(
    paymentItemId: string,
    data: RevokeEntitlementsDto,
    actor: Actor,
  ) {
    const initialItem = await this.assertRevocablePaymentItem(paymentItemId);

    if (initialItem.productTypeSnapshot !== BillingProductType.PASS_SINGLE) {
      throw new BadRequestException('이용권 상품만 회수할 수 있습니다.');
    }

    await this.reconcileInstructorState(initialItem.payment.instructorId);

    const result = await this.prisma.$transaction(async (tx) => {
      const paymentItem = await this.assertRevocablePaymentItem(
        paymentItemId,
        tx,
      );

      if (paymentItem.productTypeSnapshot !== BillingProductType.PASS_SINGLE) {
        throw new BadRequestException('이용권 상품만 회수할 수 있습니다.');
      }

      const queuedEntitlements = paymentItem.entitlements
        .filter(
          (entitlement) => entitlement.status === EntitlementStatus.QUEUED,
        )
        .sort((a, b) => {
          const startsAtGap = b.startsAt.getTime() - a.startsAt.getTime();

          if (startsAtGap !== 0) {
            return startsAtGap;
          }

          return b.sequenceNo - a.sequenceNo;
        });
      const activeEntitlement =
        paymentItem.entitlements.find(
          (entitlement) => entitlement.status === EntitlementStatus.ACTIVE,
        ) ?? null;
      const maxRevocableCount =
        queuedEntitlements.length + (activeEntitlement ? 1 : 0);

      if (maxRevocableCount === 0) {
        throw new BadRequestException('회수할 수 있는 이용권이 없습니다.');
      }

      if (data.revokeCount > maxRevocableCount) {
        throw new BadRequestException(
          '회수할 수 있는 이용권 수를 초과했습니다.',
        );
      }

      const targets = queuedEntitlements.slice(0, data.revokeCount);

      if (targets.length < data.revokeCount) {
        if (!activeEntitlement) {
          throw new BadRequestException('회수할 수 있는 이용권이 없습니다.');
        }

        if (!data.allowActiveRevoke) {
          throw new ConflictException(
            BillingErrorCode.ACTIVE_REVOKE_CONFIRM_REQUIRED,
          );
        }

        targets.push(activeEntitlement);
      }

      const batchId = randomUUID();
      const revokedEntitlements = [];
      const revokedCreditBuckets = [];

      for (const entitlement of targets) {
        const canceledEntitlement = await this.billingRepo.updateEntitlement(
          entitlement.id,
          {
            status: EntitlementStatus.CANCELED,
            canceledAt: new Date(),
          },
          tx,
        );

        const entitlementHistory = await this.appendRevocationHistory(
          {
            paymentId: paymentItem.paymentId,
            paymentItemId: paymentItem.id,
            targetType: RevocationTargetType.ENTITLEMENT,
            targetId: entitlement.id,
            actionType: RevocationActionType.CANCEL,
            fromStatus: entitlement.status,
            toStatus: EntitlementStatus.CANCELED,
            actorUserId: actor.userId,
            actorRole: actor.role,
            reason: data.reason,
            batchId,
          },
          tx,
        );

        revokedEntitlements.push({
          ...canceledEntitlement,
          revocationReason: entitlementHistory.reason,
          revocationBatchId: entitlementHistory.batchId,
        });

        if (entitlement.status !== EntitlementStatus.ACTIVE) {
          continue;
        }

        const includedBucket =
          await this.billingRepo.findIncludedCreditBucketByEntitlementId(
            entitlement.id,
            tx,
          );

        if (!includedBucket) {
          continue;
        }

        const revokedAmount = includedBucket.remainingAmount;
        const canceledBucket = await this.billingRepo.updateCreditBucket(
          includedBucket.id,
          {
            status: CreditBucketStatus.CANCELED,
            remainingAmount: 0,
          },
          tx,
        );
        const bucketHistory = await this.appendRevocationHistory(
          {
            paymentId: paymentItem.paymentId,
            paymentItemId: paymentItem.id,
            targetType: RevocationTargetType.CREDIT_BUCKET,
            targetId: includedBucket.id,
            actionType: RevocationActionType.CLAWBACK,
            fromStatus: includedBucket.status,
            toStatus: CreditBucketStatus.CANCELED,
            deltaAmount: -revokedAmount,
            actorUserId: actor.userId,
            actorRole: actor.role,
            reason: data.reason,
            batchId,
          },
          tx,
        );

        if (revokedAmount > 0) {
          await this.appendCreditLedger(
            {
              instructorId: paymentItem.payment.instructorId,
              creditBucketId: canceledBucket.id,
              type: CreditLedgerType.ADJUST,
              deltaAmount: -revokedAmount,
              referenceType: 'PAYMENT_ITEM_REVOCATION',
              referenceId: bucketHistory.id,
              reason: data.reason,
            },
            tx,
          );
        } else {
          await this.refreshCreditWallet(paymentItem.payment.instructorId, tx);
        }

        revokedCreditBuckets.push({
          ...canceledBucket,
          revokedAmount,
          revocationBatchId: bucketHistory.batchId,
          revocationReason: bucketHistory.reason,
        });
      }

      await this.markPaymentRefundPending(paymentItem.paymentId, tx);

      const wallet = await this.refreshCreditWallet(
        paymentItem.payment.instructorId,
        tx,
      );

      return {
        paymentId: paymentItem.paymentId,
        paymentItemId: paymentItem.id,
        batchId,
        revokedEntitlements,
        revokedCreditBuckets,
        wallet,
      };
    });

    return {
      ...result,
      accessStatus: await this.getMgmtAccessStatus(
        initialItem.payment.instructorId,
      ),
      payment: await this.getPayment(initialItem.paymentId),
    };
  }

  async updateReceiptRequest(
    id: string,
    data: { status: string; reviewMemo?: string },
  ) {
    const receiptRequest = await this.billingRepo.findReceiptRequestById(id);

    if (!receiptRequest) {
      throw new NotFoundException('영수증 요청을 찾을 수 없습니다.');
    }

    return this.billingRepo.updateReceiptRequest(id, {
      status: data.status,
      reviewMemo: data.reviewMemo,
      reviewedAt: new Date(),
    });
  }

  async reconcileInstructorState(instructorId: string, now: Date = new Date()) {
    return this.prisma.$transaction(async (tx) => {
      let guard = 0;

      while (guard < 120) {
        guard += 1;

        const expiringEntitlement = (
          await this.billingRepo.listEntitlementsToExpire(
            now,
            { instructorId },
            tx,
          )
        )[0];

        if (expiringEntitlement) {
          await this.expireEntitlement(expiringEntitlement, now, tx);
          continue;
        }

        const activeEntitlement = await this.billingRepo.findActiveEntitlement(
          instructorId,
          now,
          tx,
        );

        if (!activeEntitlement) {
          const readyQueued = await this.billingRepo.findReadyQueuedEntitlement(
            instructorId,
            now,
            tx,
          );

          if (!readyQueued) {
            break;
          }

          await this.activateEntitlement(readyQueued, now, tx);
          continue;
        }

        break;
      }

      const expiringBuckets = await this.billingRepo.listCreditBucketsToExpire(
        now,
        { instructorId },
        tx,
      );

      for (const bucket of expiringBuckets) {
        await this.expireCreditBucket(bucket, now, tx);
      }

      const wallet = await this.refreshCreditWallet(instructorId, tx);
      const entitlements = await this.billingRepo.listEntitlementsByInstructor(
        instructorId,
        tx,
      );
      const activeEntitlement = entitlements.find(
        (entitlement) => entitlement.status === EntitlementStatus.ACTIVE,
      );

      return {
        wallet,
        entitlements,
        activeEntitlement: activeEntitlement ?? null,
      };
    });
  }

  async reconcileAllBilling(now: Date = new Date()) {
    const [expiredEntitlements, readyQueuedEntitlements, expiringBuckets] =
      await Promise.all([
        this.billingRepo.listEntitlementsToExpire(now),
        this.billingRepo.listReadyQueuedEntitlements(now),
        this.billingRepo.listCreditBucketsToExpire(now),
      ]);

    const instructorIds = Array.from(
      new Set([
        ...expiredEntitlements.map((entitlement) => entitlement.instructorId),
        ...readyQueuedEntitlements.map(
          (entitlement) => entitlement.instructorId,
        ),
        ...expiringBuckets.map((bucket) => bucket.instructorId),
      ]),
    );

    const results = [];
    for (const instructorId of instructorIds) {
      results.push(await this.reconcileInstructorState(instructorId, now));
    }

    return {
      reconciledInstructorCount: instructorIds.length,
      results,
    };
  }

  async listEntitlementsByInstructor(instructorId: string) {
    const result = await this.reconcileInstructorState(instructorId);
    const entitlementIds = result.entitlements.map(
      (entitlement) => entitlement.id,
    );
    const revocationHistories =
      await this.billingRepo.listRevocationHistoriesByTargetIds(
        RevocationTargetType.ENTITLEMENT,
        entitlementIds,
      );

    return result.entitlements.map((entitlement) => {
      const latestRevocation = revocationHistories.find(
        (history) => history.targetId === entitlement.id,
      );

      return {
        ...entitlement,
        revocationReason: latestRevocation?.reason ?? null,
        revocationBatchId: latestRevocation?.batchId ?? null,
        lastRevokedAt: latestRevocation?.createdAt ?? null,
      };
    });
  }

  async listEntitlementsByInstructorForAdmin(instructorId: string) {
    await this.assertInstructorExists(instructorId);

    return this.listEntitlementsByInstructor(instructorId);
  }

  async getCreditSummary(instructorId: string) {
    const result = await this.reconcileInstructorState(instructorId);
    const activeBuckets =
      await this.billingRepo.listActiveCreditBuckets(instructorId);
    const allBuckets =
      await this.billingRepo.listCreditBucketsByInstructor(instructorId);
    const bucketIds = allBuckets.map((bucket) => bucket.id);
    const revocationHistories =
      await this.billingRepo.listRevocationHistoriesByTargetIds(
        RevocationTargetType.CREDIT_BUCKET,
        bucketIds,
      );
    const nextExpiryAt = activeBuckets[0]?.expiresAt ?? null;
    const rechargePacks = allBuckets
      .filter((bucket) => bucket.sourceType === CreditSourceType.RECHARGE_PACK)
      .map((bucket) => {
        const summary = this.getCreditBucketRevocationSummary(
          bucket,
          revocationHistories,
        );

        return {
          ...bucket,
          paymentId: bucket.paymentItem?.paymentId ?? null,
          originalAmount: bucket.originalAmount,
          usedAmount: summary.usedAmount,
          revokedAmount: summary.revokedAmount,
          remainingAmount: summary.remainingAmount,
          lastRevokedAt: summary.lastRevokedAt,
        };
      });

    return {
      ...result.wallet,
      nextExpiryAt,
      revokedRechargeAmount: rechargePacks.reduce(
        (sum, bucket) => sum + bucket.revokedAmount,
        0,
      ),
      buckets: activeBuckets.map((bucket) => {
        const summary = this.getCreditBucketRevocationSummary(
          bucket,
          revocationHistories,
        );

        return {
          ...bucket,
          revokedAmount: summary.revokedAmount,
          lastRevokedAt: summary.lastRevokedAt,
        };
      }),
      rechargePacks,
    };
  }

  async getCreditSummaryForAdmin(instructorId: string) {
    await this.assertInstructorExists(instructorId);

    return this.getCreditSummary(instructorId);
  }

  async getInstructorBillingSummary(
    instructorId: string,
  ): Promise<InstructorBillingSummary> {
    const context = await this.loadInstructorBillingContext(instructorId);

    return {
      activeEntitlement: this.toActiveEntitlementSummary(
        context.activeEntitlement,
      ),
      creditSummary: {
        totalAvailable: context.wallet.totalAvailable,
      },
    };
  }

  async getSessionActiveEntitlement(
    instructorId: string,
  ): Promise<SessionActiveEntitlementSummary | null> {
    const context = await this.loadInstructorBillingContext(instructorId);

    if (context.activeEntitlement) {
      return this.toActiveEntitlementSummary(context.activeEntitlement);
    }

    const hasPendingPassSinglePayment =
      await this.billingRepo.hasPendingPassSinglePayment(instructorId);

    return hasPendingPassSinglePayment
      ? {
          status: PaymentStatus.PENDING_DEPOSIT,
        }
      : null;
  }

  async listCreditLedgers(
    instructorId: string,
    query: { page: number; limit: number },
  ) {
    await this.reconcileInstructorState(instructorId);
    const result = await this.billingRepo.listCreditLedgersByInstructor(
      instructorId,
      query,
    );

    return {
      ...result,
      ledgers: result.ledgers.map((ledger) => ({
        ...ledger,
        isRevocation:
          ledger.type === CreditLedgerType.ADJUST &&
          ledger.referenceType === 'PAYMENT_ITEM_REVOCATION',
        revokedAmount:
          ledger.type === CreditLedgerType.ADJUST &&
          ledger.referenceType === 'PAYMENT_ITEM_REVOCATION'
            ? Math.abs(ledger.deltaAmount)
            : 0,
        lastRevokedAt:
          ledger.type === CreditLedgerType.ADJUST &&
          ledger.referenceType === 'PAYMENT_ITEM_REVOCATION'
            ? ledger.createdAt
            : null,
      })),
    };
  }

  async getMgmtAccessStatus(instructorId: string) {
    const context = await this.loadInstructorBillingContext(instructorId);

    return {
      canAccess: context.canAccess,
      reasonCode: context.reasonCode,
      activeEntitlement: context.activeEntitlement,
      wallet: context.wallet,
    };
  }

  async assertMgmtAccess(instructorId: string) {
    const status = await this.getMgmtAccessStatus(instructorId);

    if (!status.canAccess) {
      throw new ForbiddenException(BillingErrorCode.PLAN_REQUIRED);
    }

    return status;
  }

  private toActiveEntitlementSummary(
    activeEntitlement: Entitlement | null,
  ): InstructorActiveEntitlementSummary | null {
    if (!activeEntitlement) {
      return null;
    }

    return {
      id: activeEntitlement.id,
      status: activeEntitlement.status,
      startsAt: activeEntitlement.startsAt,
      endsAt: activeEntitlement.endsAt,
      includedCreditAmount: activeEntitlement.includedCreditAmount,
    };
  }

  private async loadInstructorBillingContext(
    instructorId: string,
  ): Promise<InstructorBillingContext> {
    const result = await this.reconcileInstructorState(instructorId);

    return {
      wallet: result.wallet,
      activeEntitlement: result.activeEntitlement,
      canAccess: result.activeEntitlement !== null,
      reasonCode:
        result.activeEntitlement === null
          ? BillingErrorCode.PLAN_REQUIRED
          : null,
    };
  }

  private async assertInstructorExists(instructorId: string) {
    const instructor = await this.billingRepo.findInstructorById(instructorId);

    if (!instructor) {
      throw new NotFoundException('강사를 찾을 수 없습니다.');
    }

    return instructor;
  }

  async consumeCredits(
    instructorId: string,
    amount: number,
    reference: { type: string; id?: string; reason?: string },
  ) {
    if (amount <= 0) {
      throw new BadRequestException('차감할 크레딧은 1 이상이어야 합니다.');
    }

    await this.reconcileInstructorState(instructorId);

    return this.runSerializableTransactionWithRetry(async (tx) => {
      const activeBuckets = await this.billingRepo.listActiveCreditBuckets(
        instructorId,
        tx,
      );
      const totalAvailable = activeBuckets.reduce(
        (sum, bucket) => sum + bucket.remainingAmount,
        0,
      );

      if (totalAvailable < amount) {
        throw new BadRequestException(BillingErrorCode.INSUFFICIENT_CREDITS);
      }

      let remainingToUse = amount;

      for (const bucket of activeBuckets) {
        if (remainingToUse <= 0) {
          break;
        }

        const consumeAmount = Math.min(bucket.remainingAmount, remainingToUse);
        const nextRemaining = bucket.remainingAmount - consumeAmount;

        await this.billingRepo.updateCreditBucket(
          bucket.id,
          {
            remainingAmount: nextRemaining,
            status:
              nextRemaining === 0
                ? CreditBucketStatus.DEPLETED
                : CreditBucketStatus.ACTIVE,
          },
          tx,
        );

        remainingToUse -= consumeAmount;

        await this.appendCreditLedger(
          {
            instructorId,
            creditBucketId: bucket.id,
            type: CreditLedgerType.USE,
            deltaAmount: -consumeAmount,
            referenceType: reference.type,
            referenceId: reference.id,
            reason: reference.reason ?? '크레딧 사용',
          },
          tx,
        );
      }

      const wallet = await this.refreshCreditWallet(instructorId, tx);

      return {
        consumedAmount: amount,
        wallet,
      };
    });
  }
}
