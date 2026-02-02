import { fakerKO as faker } from '@faker-js/faker';
import type { Attendance } from '../../generated/prisma/client.js';
import { AttendanceStatus } from '../../constants/attendances.constant.js';
import type { AttendanceStats } from '../../utils/attendance.util.js';

/** Mock Attendance 데이터 */
export const mockAttendances = {
  present: {
    id: faker.string.uuid(),
    lectureEnrollmentId: 'lecture-enrollment-id-1', // enrollmentId -> lectureEnrollmentId
    date: new Date('2024-03-01T00:00:00.000Z'),
    status: AttendanceStatus.PRESENT,
    enterTime: new Date('2024-03-01T14:00:00.000Z'),
    leaveTime: new Date('2024-03-01T16:00:00.000Z'),
    memo: null,
    createdAt: new Date('2024-03-01T14:00:00.000Z'),
    updatedAt: new Date('2024-03-01T14:00:00.000Z'),
  } as Attendance,

  absent: {
    id: faker.string.uuid(),
    lectureEnrollmentId: 'lecture-enrollment-id-1',
    date: new Date('2024-03-02T00:00:00.000Z'),
    status: AttendanceStatus.ABSENT,
    enterTime: null,
    leaveTime: null,
    memo: '개인 사정으로 결석',
    createdAt: new Date('2024-03-02T14:00:00.000Z'),
    updatedAt: new Date('2024-03-02T14:00:00.000Z'),
  } as Attendance,

  late: {
    id: faker.string.uuid(),
    lectureEnrollmentId: 'lecture-enrollment-id-1',
    date: new Date('2024-03-03T00:00:00.000Z'),
    status: AttendanceStatus.LATE,
    enterTime: new Date('2024-03-03T14:30:00.000Z'),
    leaveTime: new Date('2024-03-03T16:00:00.000Z'),
    memo: '교통 체증',
    createdAt: new Date('2024-03-03T14:30:00.000Z'),
    updatedAt: new Date('2024-03-03T14:30:00.000Z'),
  } as Attendance,
};

/** 출결 생성 요청 DTO */
export const createAttendanceRequests = {
  basic: {
    date: new Date('2024-03-01'),
    status: AttendanceStatus.PRESENT,
    enterTime: new Date('2024-03-01T14:00:00.000Z'),
    leaveTime: new Date('2024-03-01T16:00:00.000Z'),
  },
  withMemo: {
    date: new Date('2024-03-02'),
    status: AttendanceStatus.ABSENT,
    memo: '개인 사정',
  },
};

/** 단체 출결 생성 요청 DTO */
export const bulkAttendanceRequests = [
  {
    lectureEnrollmentId: 'lecture-enrollment-id-1', // enrollmentId -> lectureEnrollmentId
    date: new Date('2024-03-01'),
    status: AttendanceStatus.PRESENT,
    enterTime: new Date('2024-03-01T14:00:00.000Z'),
    leaveTime: new Date('2024-03-01T16:00:00.000Z'),
  },
  {
    lectureEnrollmentId: 'lecture-enrollment-id-2',
    date: new Date('2024-03-01'),
    status: AttendanceStatus.ABSENT,
    memo: '결석 사유',
  },
];

/** 출결 수정 요청 DTO */
export const updateAttendanceRequests = {
  statusOnly: {
    status: AttendanceStatus.ABSENT,
  },
  full: {
    status: AttendanceStatus.PRESENT,
    enterTime: new Date('2024-03-01T14:05:00.000Z'),
    leaveTime: new Date('2024-03-01T16:05:00.000Z'),
    memo: '수정된 메모',
  },
};

/** 출결 통계 Mock */
export const mockAttendanceStats: AttendanceStats = {
  totalCount: 3,
  presentCount: 1,
  absentCount: 1,
  lateCount: 1,
  earlyLeaveCount: 0,
  attendanceRate: 33.3,
  absentRate: 33.3,
};
