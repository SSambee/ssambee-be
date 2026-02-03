import { z } from 'zod';
import { AttendanceStatus } from '../constants/attendances.constant.js';
import { dateTimeSchema } from './common.validation.js';

// --- Params ---

export const lectureEnrollmentParamSchema = z.object({
  lectureId: z.string().trim().min(1, 'Lecture ID는 필수입니다.'),
  enrollmentId: z.string().trim().min(1, 'Enrollment ID는 필수입니다.'),
});

// --- Body ---

/** 단일 출결 생성 스키마 */
export const createAttendanceSchema = z.object({
  date: z.coerce.date(),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  enterTime: dateTimeSchema.optional(),
  leaveTime: dateTimeSchema.optional(),
  memo: z.string().optional(),
});

export type CreateAttendanceDto = z.infer<typeof createAttendanceSchema>;

const bulkAttendanceItemSchema = z.object({
  enrollmentId: z.string().trim().min(1, 'Enrollment ID는 필수입니다.'),
  // date는 상위에서 받음
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  enterTime: dateTimeSchema.optional(),
  leaveTime: dateTimeSchema.optional(),
  memo: z.string().optional(),
});

export const createBulkAttendancesSchema = z.object({
  date: z.coerce.date(), // 전체 적용 날짜
  attendances: z
    .array(bulkAttendanceItemSchema)
    .min(1, '최소 1개 이상의 출결 정보가 필요합니다.'),
});

// Service에서 사용하기 편하도록 Item 타입도 export
export type BulkAttendanceDto = z.infer<typeof bulkAttendanceItemSchema>;
export type CreateBulkAttendancesDto = z.infer<
  typeof createBulkAttendancesSchema
>;
