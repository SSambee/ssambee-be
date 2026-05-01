import {
  createEnrollmentSchema,
  getEnrollmentsQuerySchema,
  updateEnrollmentSchema,
} from './enrollments.validation.js';
import { EnrollmentLectureFilter } from '../constants/enrollments.constant.js';

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

  describe('getEnrollmentsQuerySchema', () => {
    it('lecture=unassigned를 수강생 목록 조회 필터로 허용한다', () => {
      const result = getEnrollmentsQuerySchema.safeParse({
        page: '1',
        limit: '10',
        lecture: EnrollmentLectureFilter.UNASSIGNED,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lecture).toBe(EnrollmentLectureFilter.UNASSIGNED);
      }
    });
  });
});
