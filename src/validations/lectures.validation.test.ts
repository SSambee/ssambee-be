import { createLectureSchema } from './lectures.validation.js';

describe('lectures.validation', () => {
  describe('createLectureSchema', () => {
    it('중첩 enrollments의 registeredAt이 있으면 Date로 변환되어야 한다', () => {
      const result = createLectureSchema.safeParse({
        title: '테스트 강의',
        enrollments: [
          {
            school: '테스트고',
            schoolYear: '고1',
            studentName: '홍길동',
            studentPhone: '010-1234-5678',
            parentPhone: '010-9876-5432',
            registeredAt: '2024-03-01T00:00:00.000Z',
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enrollments?.[0].registeredAt).toBeInstanceOf(Date);
        expect(result.data.enrollments?.[0].registeredAt?.toISOString()).toBe(
          '2024-03-01T00:00:00.000Z',
        );
      }
    });

    it('중첩 enrollments에 같은 학생 전화번호가 중복되면 실패해야 한다', () => {
      const result = createLectureSchema.safeParse({
        title: '테스트 강의',
        enrollments: [
          {
            school: '테스트고',
            schoolYear: '고1',
            studentName: '홍길동',
            studentPhone: '010-1234-5678',
            parentPhone: '010-9876-5432',
          },
          {
            school: '테스트고',
            schoolYear: '고2',
            studentName: '김길동',
            studentPhone: '010-1234-5678',
            parentPhone: '010-1111-2222',
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              message: '중복된 학생 전화번호는 허용되지 않습니다.',
              path: ['enrollments', 1, 'studentPhone'],
            }),
          ]),
        );
      }
    });
  });
});
