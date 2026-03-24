import { PrismaClient, Prisma } from '../generated/prisma/client.js';
import type {
  CreditBucket,
  Entitlement,
  Payment,
  PaymentItem,
} from '../generated/prisma/client.js';
import { BillingRepository } from '../repos/billing.repo.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '../err/http.exception.js';
import type {
  CreateBankTransferPaymentDto,
  CreateBillingProductDto,
  UpdateBillingProductDto,
} from '../validations/billing.validation.js';
import {
  BillingErrorCode,
  BillingMode,
  BillingProductType,
  CreditBucketStatus,
  CreditLedgerType,
  CreditSourceType,
  EntitlementStatus,
  IncludedCreditPolicy,
  PaymentMethodType,
  PaymentProviderType,
  PaymentStatus,
  ReceiptType,
} from '../constants/billing.constant.js';
import { config } from '../config/env.config.js';
import {
  calculateCreditExpiryAt,
  calculateMonthlyEntitlementEndAt,
  getNextEntitlementStartAt,
} from '../utils/date.util.js';

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

export class BillingService {
  constructor(
    private readonly billingRepo: BillingRepository,
    private readonly prisma: PrismaClient,
  ) {}

  private getBankAccountSnapshot() {
    const bankName = (
      config.BILLING_BANK_NAME ||
      process.env.BILLING_BANK_NAME ||
      ''
    ).trim();
    const bankAccountNumber = (
      config.BILLING_BANK_ACCOUNT_NUMBER ||
      process.env.BILLING_BANK_ACCOUNT_NUMBER ||
      ''
    ).trim();
    const bankAccountHolder = (
      config.BILLING_BANK_ACCOUNT_HOLDER ||
      process.env.BILLING_BANK_ACCOUNT_HOLDER ||
      ''
    ).trim();

    if (!bankName || !bankAccountNumber || !bankAccountHolder) {
      throw new InternalServerErrorException(
        '무통장 결제 계좌 정보가 설정되지 않았습니다.',
      );
    }

    return {
      bankName,
      bankAccountNumber,
      bankAccountHolder,
    };
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
          IncludedCreditPolicy.RECHARGE_EXPIRES_IN_DAYS,
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

  async listActiveProducts() {
    const products = await this.billingRepo.listActiveProducts();

    return products.filter(
      (product) =>
        product.paymentMethodType === PaymentMethodType.BANK_TRANSFER &&
        [
          BillingProductType.PASS_SINGLE,
          BillingProductType.CREDIT_PACK,
        ].includes(
          product.productType as
            | typeof BillingProductType.PASS_SINGLE
            | typeof BillingProductType.CREDIT_PACK,
        ),
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
    const bankAccount = this.getBankAccountSnapshot();

    const payment = await this.prisma.$transaction(async (tx) => {
      const createdPayment = await this.billingRepo.createPayment(
        {
          instructorId,
          methodType: PaymentMethodType.BANK_TRANSFER,
          providerType: PaymentProviderType.MANUAL,
          status: PaymentStatus.PENDING_DEPOSIT,
          depositorName: data.depositorName,
          totalAmount: product.price * data.quantity,
          bankName: bankAccount.bankName,
          bankAccountNumber: bankAccount.bankAccountNumber,
          bankAccountHolder: bankAccount.bankAccountHolder,
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

    return this.billingRepo.findPaymentById(payment.id);
  }

  async markPaymentDeposited(
    paymentId: string,
    instructorId: string,
    data: { depositorName?: string; depositedAt?: string },
    actor: Actor,
  ) {
    await this.assertInstructorPaymentOwner(paymentId, instructorId);

    await this.prisma.$transaction(async (tx) => {
      const payment = await this.assertInstructorPaymentOwner(
        paymentId,
        instructorId,
        tx,
      );

      if (payment.status !== PaymentStatus.PENDING_DEPOSIT) {
        throw new BadRequestException(
          '입금 대기 상태에서만 입금 알림이 가능합니다.',
        );
      }

      await this.billingRepo.updatePayment(
        paymentId,
        {
          status: PaymentStatus.PENDING_APPROVAL,
          depositorName: data.depositorName ?? payment.depositorName,
          depositedAt: data.depositedAt
            ? new Date(data.depositedAt)
            : new Date(),
        },
        tx,
      );

      await this.billingRepo.createPaymentStatusHistory(
        {
          paymentId,
          fromStatus: payment.status,
          toStatus: PaymentStatus.PENDING_APPROVAL,
          actorUserId: actor.userId,
          actorRole: actor.role,
        },
        tx,
      );
    });

    return this.billingRepo.findPaymentById(paymentId);
  }

  async listInstructorPayments(
    instructorId: string,
    query: { status?: string; page: number; limit: number },
  ) {
    return this.billingRepo.listInstructorPayments(instructorId, query);
  }

  async listPayments(query: { status?: string; page: number; limit: number }) {
    return this.billingRepo.listPayments(query);
  }

  async getInstructorPayment(paymentId: string, instructorId: string) {
    return this.assertInstructorPaymentOwner(paymentId, instructorId);
  }

  async getPayment(paymentId: string) {
    const payment = await this.billingRepo.findPaymentById(paymentId);

    if (!payment) {
      throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
    }

    return payment;
  }

  async approvePayment(paymentId: string, actor: Actor, memo?: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.billingRepo.findPaymentById(paymentId, tx);

      if (!payment) {
        throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
      }

      if (payment.status !== PaymentStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          '승인 대기 상태에서만 결제 승인이 가능합니다.',
        );
      }

      const approvedAt = new Date();

      await this.billingRepo.updatePayment(
        paymentId,
        {
          status: PaymentStatus.APPROVED,
          approvedAt,
        },
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

    return this.billingRepo.findPaymentById(paymentId);
  }

  async rejectPayment(paymentId: string, actor: Actor, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const payment = await this.billingRepo.findPaymentById(paymentId, tx);

      if (!payment) {
        throw new NotFoundException('결제 내역을 찾을 수 없습니다.');
      }

      if (payment.status !== PaymentStatus.PENDING_APPROVAL) {
        throw new BadRequestException(
          '승인 대기 상태에서만 결제 반려가 가능합니다.',
        );
      }

      await this.billingRepo.updatePayment(
        paymentId,
        {
          status: PaymentStatus.REJECTED,
          rejectedAt: new Date(),
        },
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

    return this.billingRepo.findPaymentById(paymentId);
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

        const activeEntitlement = await this.billingRepo.findActiveEntitlement(
          instructorId,
          tx,
        );

        if (activeEntitlement && activeEntitlement.endsAt < now) {
          await this.expireEntitlement(activeEntitlement, now, tx);
          continue;
        }

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

      const activeBuckets = await this.billingRepo.listActiveCreditBuckets(
        instructorId,
        tx,
      );

      for (const bucket of activeBuckets) {
        if (bucket.expiresAt < now) {
          await this.expireCreditBucket(bucket, now, tx);
        }
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
    return result.entitlements;
  }

  async getCreditSummary(instructorId: string) {
    const result = await this.reconcileInstructorState(instructorId);
    const activeBuckets =
      await this.billingRepo.listActiveCreditBuckets(instructorId);
    const nextExpiryAt = activeBuckets[0]?.expiresAt ?? null;

    return {
      ...result.wallet,
      nextExpiryAt,
      buckets: activeBuckets,
    };
  }

  async listCreditLedgers(
    instructorId: string,
    query: { page: number; limit: number },
  ) {
    await this.reconcileInstructorState(instructorId);
    return this.billingRepo.listCreditLedgersByInstructor(instructorId, query);
  }

  async getMgmtAccessStatus(instructorId: string) {
    const result = await this.reconcileInstructorState(instructorId);

    if (!result.activeEntitlement) {
      return {
        canAccess: false,
        reasonCode: BillingErrorCode.PLAN_REQUIRED,
        activeEntitlement: null,
        wallet: result.wallet,
      };
    }

    return {
      canAccess: true,
      reasonCode: null,
      activeEntitlement: result.activeEntitlement,
      wallet: result.wallet,
    };
  }

  async assertMgmtAccess(instructorId: string) {
    const status = await this.getMgmtAccessStatus(instructorId);

    if (!status.canAccess) {
      throw new ForbiddenException(BillingErrorCode.PLAN_REQUIRED);
    }

    return status;
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

    return this.prisma.$transaction(async (tx) => {
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
