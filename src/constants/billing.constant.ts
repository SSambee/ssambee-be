export const BillingProductType = {
  PASS_SINGLE: 'PASS_SINGLE',
  PASS_SUBSCRIPTION: 'PASS_SUBSCRIPTION',
  CREDIT_PACK: 'CREDIT_PACK',
} as const;

export type BillingProductType =
  (typeof BillingProductType)[keyof typeof BillingProductType];

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
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELED: 'CANCELED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

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

export const IncludedCreditPolicy = {
  MONTHLY_AMOUNT: 1000,
  RECHARGE_EXPIRES_IN_DAYS: 90,
} as const;

export const BillingErrorCode = {
  PLAN_REQUIRED: 'PLAN_REQUIRED',
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
} as const;
