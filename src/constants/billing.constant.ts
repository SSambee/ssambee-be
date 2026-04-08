export const BillingProductType = {
  PASS_SINGLE: 'PASS_SINGLE',
  PASS_SUBSCRIPTION: 'PASS_SUBSCRIPTION',
  CREDIT_PACK: 'CREDIT_PACK',
} as const;

export type BillingProductType =
  (typeof BillingProductType)[keyof typeof BillingProductType];

export const EXPOSED_BILLING_PRODUCT_TYPES = [
  BillingProductType.PASS_SINGLE,
  BillingProductType.CREDIT_PACK,
] as const;

export type ExposedBillingProductType =
  (typeof EXPOSED_BILLING_PRODUCT_TYPES)[number];

export const EXPOSED_BILLING_PRODUCT_GROUP_KEY = {
  [BillingProductType.PASS_SINGLE]: 'passSingleProducts',
  [BillingProductType.CREDIT_PACK]: 'creditPackProducts',
} as const satisfies Record<ExposedBillingProductType, string>;

export type ExposedBillingProductGroupKey =
  (typeof EXPOSED_BILLING_PRODUCT_GROUP_KEY)[ExposedBillingProductType];

export const isExposedBillingProductType = (
  productType: string,
): productType is ExposedBillingProductType =>
  EXPOSED_BILLING_PRODUCT_TYPES.includes(
    productType as ExposedBillingProductType,
  );

export const BillingMode = {
  ONE_TIME: 'ONE_TIME',
  RECURRING: 'RECURRING',
} as const;

export type BillingMode = (typeof BillingMode)[keyof typeof BillingMode];

export const PaymentMethodType = {
  BANK_TRANSFER: 'BANK_TRANSFER',
  TOSS_LINK: 'TOSS_LINK',
  TOSS_BILLING: 'TOSS_BILLING',
} as const;

export type PaymentMethodType =
  (typeof PaymentMethodType)[keyof typeof PaymentMethodType];

export const PaymentProviderType = {
  MANUAL: 'MANUAL',
  TOSS: 'TOSS',
} as const;

export type PaymentProviderType =
  (typeof PaymentProviderType)[keyof typeof PaymentProviderType];

export const PaymentStatus = {
  PENDING_DEPOSIT: 'PENDING_DEPOSIT',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentRefundStatus = {
  NONE: 'NONE',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
} as const;

export type PaymentRefundStatus =
  (typeof PaymentRefundStatus)[keyof typeof PaymentRefundStatus];

export const ReceiptType = {
  CASH_RECEIPT: 'CASH_RECEIPT',
  BUSINESS_RECEIPT: 'BUSINESS_RECEIPT',
} as const;

export type ReceiptType = (typeof ReceiptType)[keyof typeof ReceiptType];

export const ReceiptStatus = {
  REQUESTED: 'REQUESTED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
} as const;

export type ReceiptStatus = (typeof ReceiptStatus)[keyof typeof ReceiptStatus];

export const EntitlementStatus = {
  QUEUED: 'QUEUED',
  ACTIVE: 'ACTIVE',
  EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED',
} as const;

export type EntitlementStatus =
  (typeof EntitlementStatus)[keyof typeof EntitlementStatus];

export const CreditSourceType = {
  ENTITLEMENT_INCLUDED: 'ENTITLEMENT_INCLUDED',
  RECHARGE_PACK: 'RECHARGE_PACK',
} as const;

export type CreditSourceType =
  (typeof CreditSourceType)[keyof typeof CreditSourceType];

export const CreditBucketStatus = {
  ACTIVE: 'ACTIVE',
  DEPLETED: 'DEPLETED',
  EXPIRED: 'EXPIRED',
  CANCELED: 'CANCELED',
} as const;

export type CreditBucketStatus =
  (typeof CreditBucketStatus)[keyof typeof CreditBucketStatus];

export const CreditLedgerType = {
  GRANT: 'GRANT',
  USE: 'USE',
  EXPIRE: 'EXPIRE',
  ADJUST: 'ADJUST',
} as const;

export type CreditLedgerType =
  (typeof CreditLedgerType)[keyof typeof CreditLedgerType];

export const RevocationTargetType = {
  ENTITLEMENT: 'ENTITLEMENT',
  CREDIT_BUCKET: 'CREDIT_BUCKET',
} as const;

export type RevocationTargetType =
  (typeof RevocationTargetType)[keyof typeof RevocationTargetType];

export const RevocationActionType = {
  CANCEL: 'CANCEL',
  CLAWBACK: 'CLAWBACK',
} as const;

export type RevocationActionType =
  (typeof RevocationActionType)[keyof typeof RevocationActionType];

export const IncludedCreditPolicy = {
  MONTHLY_AMOUNT: 1000,
  RECHARGE_EXPIRES_IN_DAYS: 90,
} as const;

export const BillingSystemProductCode = {
  ADMIN_CREDIT_GRANT_ZERO: 'ADMIN_CREDIT_GRANT_ZERO',
} as const;

export const BillingErrorCode = {
  PLAN_REQUIRED: 'PLAN_REQUIRED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  ACTIVE_REVOKE_CONFIRM_REQUIRED: 'ACTIVE_REVOKE_CONFIRM_REQUIRED',
} as const;
