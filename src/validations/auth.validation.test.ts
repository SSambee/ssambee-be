import {
  adminActivationCompleteSchema,
  adminActivationRequestSchema,
  adminActivationVerifySchema,
  emailVerificationSchema,
} from './auth.validation.js';

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

  describe('admin activation schemas', () => {
    it('관리자 OTP 요청 스키마는 유효한 이메일을 허용한다', () => {
      const result = adminActivationRequestSchema.safeParse({
        email: 'admin@example.com',
      });

      expect(result.success).toBe(true);
    });

    it('관리자 OTP 검증 스키마는 이메일과 otp를 요구한다', () => {
      const result = adminActivationVerifySchema.safeParse({
        email: 'admin@example.com',
        otp: '123456',
      });

      expect(result.success).toBe(true);
    });

    it('관리자 활성화 완료 스키마는 규칙에 맞는 비밀번호를 요구한다', () => {
      const result = adminActivationCompleteSchema.safeParse({
        password: 'Password123!',
      });

      expect(result.success).toBe(true);
    });
  });
});
