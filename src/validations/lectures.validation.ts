import { z } from 'zod';
import { Regex } from '../constants/regex.constant.js';
import {
  LectureLimits,
  LectureStatus,
} from '../constants/lectures.constant.js';
import { PaginationDefaults } from '../constants/common.constant.js';
import { SCHOOL_YEARS } from '../constants/enrollments.constant.js';
import { dateTimeSchema } from './common.validation.js';

const phoneSchema = z
  .string()
  .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.');

/** LectureTime 단일 항목 스키마 */
export const lectureTimeItemSchema = z.object({
  day: z.string().min(1, { message: '요일은 최소 1개 이상이어야 합니다.' }),
  startTime: z.string().regex(Regex.TIME_HHMM, {
    message: '시작 시간은 HH:MM 형식이어야 합니다.',
  }),
  endTime: z.string().regex(Regex.TIME_HHMM, {
    message: '종료 시간은 HH:MM 형식이어야 합니다.',
  }),
});

export type LectureTimeItemDto = z.infer<typeof lectureTimeItemSchema>;

/** 강의 생성 요청 DTO 스키마 (frontend에서 요청하는 데이터 형식) */
export const lectureEnrollmentSchema = z.object({
  school: z
    .string()
    .min(1, { message: '학교명은 필수입니다.' })
    .max(50, { message: '학교명은 50자를 초과할 수 없습니다.' })
    .trim(),

  schoolYear: z.string().min(1, { message: '학년은 필수입니다.' }).trim(),

  studentName: z
    .string()
    .min(1, { message: '학생 이름은 필수입니다.' })
    .max(50, { message: '학생 이름은 50자를 초과할 수 없습니다.' })
    .trim(),

  studentPhone: phoneSchema,
  parentPhone: phoneSchema,
});

export type LectureEnrollmentDto = z.infer<typeof lectureEnrollmentSchema>;

/** 강의 생성 요청 DTO 스키마 (frontend에서 요청하는 데이터 형식) */
export const createLectureSchema = z.object({
  title: z
    .string()
    .min(1, { message: '강의 제목은 필수입니다.' })
    .max(LectureLimits.TITLE_MAX_LENGTH, {
      message: `강의 제목은 ${LectureLimits.TITLE_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim(),

  schoolYear: z
    .enum(SCHOOL_YEARS, { message: '유효한 학년이 아닙니다.' })
    .optional(),

  subject: z
    .string()
    .max(LectureLimits.SUBJECT_MAX_LENGTH, {
      message: `과목명은 ${LectureLimits.SUBJECT_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  description: z
    .string()
    .max(LectureLimits.DESCRIPTION_MAX_LENGTH, {
      message: `설명은 ${LectureLimits.DESCRIPTION_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  startAt: dateTimeSchema.optional().nullable(),

  endAt: dateTimeSchema.optional().nullable(),

  status: z
    .nativeEnum(LectureStatus)
    .optional()
    .default(LectureStatus.SCHEDULED),

  lectureTimes: z.array(lectureTimeItemSchema).optional(),

  enrollments: z.array(lectureEnrollmentSchema).optional(),
});

export type CreateLectureDto = z.infer<typeof createLectureSchema>;
export type CreateLectureWithInstructorIdDto = CreateLectureDto & {
  instructorId: string;
};

/** 강의 리스트 조회 쿼리 파라미터 스키마 */
export const getLecturesQuerySchema = z.object({
  page: z.coerce.number().min(1).default(PaginationDefaults.PAGE),
  limit: z.coerce
    .number()
    .min(1)
    .max(PaginationDefaults.MAX_LIMIT)
    .default(PaginationDefaults.LIMIT),
  search: z.string().trim().optional(),
  day: z.coerce.number().min(0).max(6).optional(), // 0=일요일, 6=토요일
});

export type GetLecturesQueryDto = z.infer<typeof getLecturesQuerySchema>;

/** 강의 ID 파라미터 스키마 (/:id) */
export const lectureParamSchema = z.object({
  id: z.string().min(1, { message: '강의 ID는 필수입니다.' }),
});

export type LectureParamDto = z.infer<typeof lectureParamSchema>;

/** 강의 ID 파라미터 스키마 (/:lectureId) */
export const lectureIdParamSchema = z.object({
  lectureId: z.string().min(1, { message: '강의 ID는 필수입니다.' }),
});

export type LectureIdParamDto = z.infer<typeof lectureIdParamSchema>;

/** 강의 수정 요청 스키마 */
export const updateLectureSchema = z.object({
  title: z
    .string()
    .min(1, { message: '강의 제목은 필수입니다.' })
    .max(LectureLimits.TITLE_MAX_LENGTH, {
      message: `강의 제목은 ${LectureLimits.TITLE_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  schoolYear: z
    .enum(SCHOOL_YEARS, { message: '유효한 학년이 아닙니다.' })
    .optional(),

  subject: z
    .string()
    .max(LectureLimits.SUBJECT_MAX_LENGTH, {
      message: `과목명은 ${LectureLimits.SUBJECT_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  description: z
    .string()
    .max(LectureLimits.DESCRIPTION_MAX_LENGTH, {
      message: `설명은 ${LectureLimits.DESCRIPTION_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  startAt: dateTimeSchema.optional().nullable(),

  endAt: dateTimeSchema.optional().nullable(),

  status: z.nativeEnum(LectureStatus).optional(),

  lectureTimes: z.array(lectureTimeItemSchema).optional(),
});

export type UpdateLectureDto = z.infer<typeof updateLectureSchema>;

/** 강의 삭제 요청 스키마 */
export const deleteLectureSchema = z.object({});

export type DeleteLectureDto = z.infer<typeof deleteLectureSchema>;
