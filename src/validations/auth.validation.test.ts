import { emailVerificationSchema } from './auth.validation.js';

describe('auth.validation', () => {
  describe('emailVerificationSchema', () => {
    it('otp가 null이면 인증코드 재발송 요청으로 처리할 수 있다', () => {
      const result = emailVerificationSchema.safeParse({
        email: 'user@example.com',
        otp: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.otp).toBeUndefined();
      }
    });

    it('otp가 빈 문자열이면 인증코드 재발송 요청으로 처리할 수 있다', () => {
      const result = emailVerificationSchema.safeParse({
        email: 'user@example.com',
        otp: '   ',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.otp).toBeUndefined();
      }
    });
  });
});
