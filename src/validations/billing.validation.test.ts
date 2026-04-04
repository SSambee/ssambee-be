import {
  BillingMode,
  BillingProductType,
  PaymentMethodType,
} from '../constants/billing.constant.js';
import {
  createBillingProductSchema,
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
});
