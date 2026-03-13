import {
  createEnrollmentSchema,
  updateEnrollmentSchema,
} from './enrollments.validation.js';

describe('enrollments.validation', () => {
  describe('createEnrollmentSchema', () => {
    it('registeredAt이 있으면 Date로 변환되어야 한다', () => {
      const result = createEnrollmentSchema.safeParse({
        studentName: '홍길동',
        school: '테스트고',
        schoolYear: '고1',
        studentPhone: '010-1234-5678',
        parentPhone: '010-9876-5432',
        registeredAt: '2024-03-01T00:00:00.000Z',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registeredAt).toBeInstanceOf(Date);
        expect(result.data.registeredAt?.toISOString()).toBe(
          '2024-03-01T00:00:00.000Z',
        );
      }
    });
  });

  describe('updateEnrollmentSchema', () => {
    it('registeredAt만 보내도 수정 요청으로 허용되어야 한다', () => {
      const result = updateEnrollmentSchema.safeParse({
        registeredAt: '2024-04-01T00:00:00.000Z',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.registeredAt).toBeInstanceOf(Date);
        expect(result.data.registeredAt?.toISOString()).toBe(
          '2024-04-01T00:00:00.000Z',
        );
      }
    });
  });
});
