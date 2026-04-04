import { z } from 'zod';
import {
  BillingMode,
  BillingProductType,
  PaymentMethodType,
  PaymentRefundStatus,
  PaymentStatus,
  ReceiptStatus,
  ReceiptType,
} from '../constants/billing.constant.js';
import { Regex } from '../constants/regex.constant.js';

const cuidSchema = z.string().min(1, 'id는 필수입니다.');

const cashReceiptSchema = z.object({
  type: z.literal(ReceiptType.CASH_RECEIPT),
  phoneNumber: z
    .string()
    .regex(Regex.PHONE, '유효한 휴대폰 번호 형식이 아닙니다.'),
});

const businessReceiptSchema = z.object({
  type: z.literal(ReceiptType.BUSINESS_RECEIPT),
  businessRegistrationNumber: z.string().min(1, '사업자등록번호는 필수입니다.'),
  businessName: z.string().min(1, '상호는 필수입니다.'),
  representativeName: z.string().min(1, '대표자명은 필수입니다.'),
  taxInvoiceEmail: z
    .string()
    .email('세금계산서 수신 이메일 형식이 올바르지 않습니다.'),
  businessType: z.string().min(1, '업태는 필수입니다.'),
  businessCategory: z.string().min(1, '종목은 필수입니다.'),
  businessAddress: z.string().min(1, '사업장 주소는 필수입니다.'),
});

export const receiptRequestSchema = z.union([
  cashReceiptSchema,
  businessReceiptSchema,
]);

export const createBankTransferPaymentSchema = z.object({
  productId: cuidSchema,
  quantity: z
    .number()
    .int('수량은 정수여야 합니다.')
    .positive('수량은 1 이상이어야 합니다.')
    .default(1),
  depositorName: z.string().min(1, '입금자명은 필수입니다.'),
  receiptRequest: receiptRequestSchema.optional(),
});

export type CreateBankTransferPaymentDto = z.infer<
  typeof createBankTransferPaymentSchema
>;

export const paymentIdParamSchema = z.object({
  paymentId: cuidSchema,
});

export const productIdParamSchema = z.object({
  id: cuidSchema,
});

export const instructorIdParamSchema = z.object({
  instructorId: cuidSchema,
});

export const paymentItemIdParamSchema = z.object({
  paymentItemId: cuidSchema,
});

export const receiptRequestIdParamSchema = z.object({
  id: cuidSchema,
});

export const markDepositSchema = z.object({
  depositorName: z.string().min(1).optional(),
  depositedAt: z.string().datetime().optional(),
});

export const paymentListQuerySchema = z.object({
  status: z
    .enum([
      PaymentStatus.PENDING_DEPOSIT,
      PaymentStatus.PENDING_APPROVAL,
      PaymentStatus.APPROVED,
      PaymentStatus.REJECTED,
      PaymentStatus.CANCELED,
      PaymentStatus.FAILED,
      PaymentStatus.EXPIRED,
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const creditHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const createBillingProductSchema = z.object({
  code: z.string().min(1, '상품 코드는 필수입니다.'),
  name: z.string().min(1, '상품명은 필수입니다.'),
  description: z.string().optional(),
  productType: z.enum([
    BillingProductType.PASS_SINGLE,
    BillingProductType.PASS_SUBSCRIPTION,
    BillingProductType.CREDIT_PACK,
  ]),
  billingMode: z
    .enum([BillingMode.ONE_TIME, BillingMode.RECURRING])
    .default(BillingMode.ONE_TIME),
  paymentMethodType: z.enum([
    PaymentMethodType.BANK_TRANSFER,
    PaymentMethodType.TOSS_LINK,
    PaymentMethodType.TOSS_BILLING,
  ]),
  durationMonths: z.number().int().positive().optional(),
  includedCreditAmount: z.number().int().min(0).default(0),
  rechargeCreditAmount: z.number().int().min(0).default(0),
  price: z.number().int().min(0),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});

export type CreateBillingProductDto = z.infer<
  typeof createBillingProductSchema
>;

export const adminCreditGrantSchema = z.object({
  creditAmount: z
    .number()
    .int('크레딧은 정수여야 합니다.')
    .positive('크레딧은 1 이상이어야 합니다.'),
  expiresInDays: z
    .number()
    .int('기간은 정수여야 합니다.')
    .positive('기간은 1일 이상이어야 합니다.'),
  reason: z.string().min(1, '지급 사유는 필수입니다.'),
});

export type CreateAdminCreditGrantDto = z.infer<typeof adminCreditGrantSchema>;

export const updateBillingProductSchema = createBillingProductSchema.partial();

export type UpdateBillingProductDto = z.infer<
  typeof updateBillingProductSchema
>;

export const approvePaymentSchema = z.object({
  memo: z.string().optional(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().min(1, '반려 사유는 필수입니다.'),
});

export const updatePaymentRefundStatusSchema = z.object({
  refundStatus: z.enum([
    PaymentRefundStatus.PENDING,
    PaymentRefundStatus.COMPLETED,
  ]),
  refundMemo: z.string().optional(),
});

export type UpdatePaymentRefundStatusDto = z.infer<
  typeof updatePaymentRefundStatusSchema
>;

export const revokeEntitlementsSchema = z.object({
  revokeCount: z
    .number()
    .int('회수 건수는 정수여야 합니다.')
    .positive('회수 건수는 1 이상이어야 합니다.'),
  reason: z.string().min(1, '회수 사유는 필수입니다.'),
  allowActiveRevoke: z.boolean().optional(),
});

export type RevokeEntitlementsDto = z.infer<typeof revokeEntitlementsSchema>;

export const revokeRechargeCreditsSchema = z.object({
  reason: z.string().min(1, '회수 사유는 필수입니다.'),
});

export type RevokeRechargeCreditsDto = z.infer<
  typeof revokeRechargeCreditsSchema
>;

export const updateReceiptRequestSchema = z.object({
  status: z.enum([ReceiptStatus.COMPLETED, ReceiptStatus.REJECTED]),
  reviewMemo: z.string().optional(),
});
