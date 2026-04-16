import {
  BillingMode,
  BillingProductType,
  PaymentMethodType,
} from '../constants/billing.constant.js';
import {
  createBankTransferPaymentSchema,
  createBillingProductSchema,
  paymentListQuerySchema,
  updatePaymentRefundStatusSchema,
  updateBillingProductSchema,
} from './billing.validation.js';

describe('billing.validation', () => {
  describe('createBillingProductSchema', () => {
    it('highlights가 없으면 빈 배열로 기본값을 채운다', () => {
      const result = createBillingProductSchema.safeParse({
        code: 'PASS_SINGLE_1M',
        name: '1개월 이용권',
        productType: BillingProductType.PASS_SINGLE,
        paymentMethodType: PaymentMethodType.BANK_TRANSFER,
        price: 99000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.highlights).toEqual([]);
        expect(result.data.billingMode).toBe(BillingMode.ONE_TIME);
      }
    });
  });

  describe('updateBillingProductSchema', () => {
    it('price만 보내면 다른 기본값 필드를 주입하지 않는다', () => {
      const result = updateBillingProductSchema.safeParse({
        price: 123000,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          price: 123000,
        });
      }
    });

    it('highlights를 보내면 그대로 유지한다', () => {
      const result = updateBillingProductSchema.safeParse({
        highlights: ['핵심 혜택', '추가 크레딧'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.highlights).toEqual(['핵심 혜택', '추가 크레딧']);
      }
    });
  });

  describe('bank transfer schemas', () => {
    it('무통장 결제 생성 시 입금은행이 없으면 실패해야 한다', () => {
      const result = createBankTransferPaymentSchema.safeParse({
        productId: 'product-1',
        quantity: 1,
        depositorName: '홍길동',
      });

      expect(result.success).toBe(false);
    });

    it('제거된 PENDING_APPROVAL 상태는 목록 필터에서 허용하지 않아야 한다', () => {
      const result = paymentListQuerySchema.safeParse({
        status: 'PENDING_APPROVAL',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('updatePaymentRefundStatusSchema', () => {
    it('이용권 환불 요청 시 회수 옵션을 함께 허용해야 한다', () => {
      const result = updatePaymentRefundStatusSchema.safeParse({
        refundStatus: 'PENDING',
        refundMemo: '이용권 환불 접수',
        revokeCount: 2,
        allowActiveRevoke: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          refundStatus: 'PENDING',
          refundMemo: '이용권 환불 접수',
          revokeCount: 2,
          allowActiveRevoke: true,
        });
      }
    });

    it('회수 건수가 0이면 실패해야 한다', () => {
      const result = updatePaymentRefundStatusSchema.safeParse({
        refundStatus: 'PENDING',
        revokeCount: 0,
      });

      expect(result.success).toBe(false);
    });
  });
});
