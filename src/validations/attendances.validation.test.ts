import {
  attendanceIdParamSchema,
  createBulkAttendancesSchema,
} from './attendances.validation.js';
import { AttendanceStatus } from '../constants/attendances.constant.js';

describe('attendances.validation', () => {
  describe('attendanceIdParamSchema', () => {
    it('attendanceId가 없으면 실패해야 한다', () => {
      const result = attendanceIdParamSchema.safeParse({
        attendanceId: '   ',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('createBulkAttendancesSchema', () => {
    it('같은 enrollmentId가 중복되면 실패해야 한다', () => {
      const result = createBulkAttendancesSchema.safeParse({
        date: '2024-03-01',
        attendances: [
          {
            enrollmentId: 'enrollment-1',
            status: AttendanceStatus.PRESENT,
          },
          {
            enrollmentId: 'enrollment-1',
            status: AttendanceStatus.ABSENT,
          },
        ],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              path: ['attendances', 1, 'enrollmentId'],
              message: '중복된 Enrollment ID는 허용되지 않습니다.',
            }),
          ]),
        );
      }
    });
  });
});
