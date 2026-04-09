import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/db.config.js';
import {
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
} from '../../constants/billing.constant.js';

export const seedActiveInstructorEntitlement = async (
  instructorId: string,
  options?: {
    startsAt?: Date;
    endsAt?: Date;
    includedCreditAmount?: number;
  },
) => {
  const now = new Date();
  const startsAt =
    options?.startsAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const endsAt =
    options?.endsAt ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const includedCreditAmount =
    options?.includedCreditAmount ?? IncludedCreditPolicy.MONTHLY_AMOUNT;

  const product = await prisma.billingProduct.create({
    data: {
      code: `TEST_PASS_${randomUUID()}`,
      name: '테스트 활성 이용권',
      description: 'mgmt 접근 허용용 테스트 이용권',
      productType: BillingProductType.PASS_SINGLE,
      billingMode: BillingMode.ONE_TIME,
      paymentMethodType: PaymentMethodType.BANK_TRANSFER,
      durationMonths: 1,
      includedCreditAmount,
      rechargeCreditAmount: 0,
      price: 100000,
      isActive: true,
      sortOrder: 0,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      instructorId,
      methodType: PaymentMethodType.BANK_TRANSFER,
      providerType: PaymentProviderType.MANUAL,
      status: PaymentStatus.APPROVED,
      totalAmount: 100000,
      approvedAt: startsAt,
    },
  });

  const paymentItem = await prisma.paymentItem.create({
    data: {
      paymentId: payment.id,
      billingProductId: product.id,
      productCodeSnapshot: product.code,
      productNameSnapshot: product.name,
      productTypeSnapshot: product.productType,
      quantity: 1,
      unitPrice: 100000,
      totalPrice: 100000,
      durationMonthsSnapshot: 1,
      includedCreditAmountSnapshot: includedCreditAmount,
      rechargeCreditAmountSnapshot: 0,
    },
  });

  const entitlement = await prisma.entitlement.create({
    data: {
      instructorId,
      paymentItemId: paymentItem.id,
      sequenceNo: 1,
      status: EntitlementStatus.ACTIVE,
      startsAt,
      endsAt,
      activatedAt: startsAt,
      includedCreditAmount,
    },
  });

  const creditBucket = await prisma.creditBucket.create({
    data: {
      instructorId,
      paymentItemId: paymentItem.id,
      entitlementId: entitlement.id,
      sourceType: CreditSourceType.ENTITLEMENT_INCLUDED,
      status: CreditBucketStatus.ACTIVE,
      originalAmount: includedCreditAmount,
      remainingAmount: includedCreditAmount,
      grantedAt: startsAt,
      expiresAt: endsAt,
    },
  });

  await prisma.creditWallet.create({
    data: {
      instructorId,
      totalAvailable: includedCreditAmount,
      includedAvailable: includedCreditAmount,
      rechargeAvailable: 0,
      lastReconciledAt: now,
    },
  });

  await prisma.creditLedger.create({
    data: {
      instructorId,
      creditBucketId: creditBucket.id,
      type: CreditLedgerType.GRANT,
      deltaAmount: includedCreditAmount,
      balanceAfterTotal: includedCreditAmount,
      balanceAfterIncluded: includedCreditAmount,
      balanceAfterRecharge: 0,
      referenceType: 'ENTITLEMENT',
      referenceId: entitlement.id,
      reason: 'mgmt 접근 허용용 테스트 기본 크레딧 지급',
    },
  });

  return {
    product,
    payment,
    paymentItem,
    entitlement,
    creditBucket,
  };
};
