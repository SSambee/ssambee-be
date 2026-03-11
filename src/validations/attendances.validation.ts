import { z } from 'zod';
import { AttendanceStatus } from '../constants/attendances.constant.js';
import { dateTimeSchema } from './common.validation.js';

/**
 * 강의 및 수강 ID 경로 파라미터 검증 스키마
 */
export const lectureEnrollmentParamSchema = z.object({
  /** 강의 ID */
  lectureId: z.string().trim().min(1, 'Lecture ID는 필수입니다.'),
  /** 수강 ID */
  enrollmentId: z.string().trim().min(1, 'Enrollment ID는 필수입니다.'),
});

/**
 * 단일 출결 생성 요청 검증 스키마
 */
export const createAttendanceSchema = z.object({
  /** 출결 날짜 */
  date: z.coerce.date(),
  /** 출결 상태 (출석, 지각, 결석, 조퇴) */
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  /** 입실 시간 (선택) */
  enterTime: dateTimeSchema.optional(),
  /** 퇴실 시간 (선택) */
  leaveTime: dateTimeSchema.optional(),
  /** 메모 (선택) */
  memo: z.string().optional(),
});

/** 단일 출결 생성 DTO 타입 */
export type CreateAttendanceDto = z.infer<typeof createAttendanceSchema>;

/**
 * 일괄 출결 항목 검증 스키마
 */
const bulkAttendanceItemSchema = z.object({
  /** 수강 ID */
  enrollmentId: z.string().trim().min(1, 'Enrollment ID는 필수입니다.'),
  /** 출결 상태 */
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  /** 입실 시간 (선택) */
  enterTime: dateTimeSchema.optional(),
  /** 퇴실 시간 (선택) */
  leaveTime: dateTimeSchema.optional(),
  /** 메모 (선택) */
  memo: z.string().optional(),
});

/**
 * 일괄 출결 생성 요청 검증 스키마
 */
export const createBulkAttendancesSchema = z
  .object({
    /** 출결 날짜 (전체 적용) */
    date: z.coerce.date(),
    /** 출결 항목 목록 */
    attendances: z
      .array(bulkAttendanceItemSchema)
      .min(1, '최소 1개 이상의 출결 정보가 필요합니다.'),
  })
  .superRefine((data, ctx) => {
    const seenEnrollmentIds = new Set<string>();

    data.attendances.forEach((attendance, index) => {
      if (seenEnrollmentIds.has(attendance.enrollmentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['attendances', index, 'enrollmentId'],
          message: '중복된 Enrollment ID는 허용되지 않습니다.',
        });
        return;
      }

      seenEnrollmentIds.add(attendance.enrollmentId);
    });
  });

/** 일괄 출결 항목 DTO 타입 */
export type BulkAttendanceDto = z.infer<typeof bulkAttendanceItemSchema>;
/** 일괄 출결 생성 DTO 타입 */
export type CreateBulkAttendancesDto = z.infer<
  typeof createBulkAttendancesSchema
>;
