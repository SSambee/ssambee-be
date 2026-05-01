import { z } from 'zod';
import { Regex } from '../constants/regex.constant.js';
import {
  LectureLimits,
  LectureStatus,
} from '../constants/lectures.constant.js';
import { PaginationDefaults } from '../constants/common.constant.js';
import { SCHOOL_YEARS } from '../constants/enrollments.constant.js';
import { dateTimeSchema } from './common.validation.js';

/** 전화번호 검증 스키마 */
const phoneSchema = z
  .string()
  .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.');

/**
 * 수업 시간 단일 항목 검증 스키마
 */
export const lectureTimeItemSchema = z.object({
  /** 요일 */
  day: z.string().min(1, { message: '요일은 최소 1개 이상이어야 합니다.' }),
  /** 시작 시간 (HH:MM 형식) */
  startTime: z.string().regex(Regex.TIME_HHMM, {
    message: '시작 시간은 HH:MM 형식이어야 합니다.',
  }),
  /** 종료 시간 (HH:MM 형식) */
  endTime: z.string().regex(Regex.TIME_HHMM, {
    message: '종료 시간은 HH:MM 형식이어야 합니다.',
  }),
});

/** 수업 시간 항목 DTO 타입 */
export type LectureTimeItemDto = z.infer<typeof lectureTimeItemSchema>;

/**
 * 강의 생성 시 포함되는 수강 정보 검증 스키마
 */
export const lectureEnrollmentSchema = z.object({
  /** 학교명 */
  school: z
    .string()
    .min(1, { message: '학교명은 필수입니다.' })
    .max(50, { message: '학교명은 50자를 초과할 수 없습니다.' })
    .trim(),

  /** 학년 */
  schoolYear: z.string().min(1, { message: '학년은 필수입니다.' }).trim(),

  /** 학생 이름 */
  studentName: z
    .string()
    .min(1, { message: '학생 이름은 필수입니다.' })
    .max(50, { message: '학생 이름은 50자를 초과할 수 없습니다.' })
    .trim(),

  /** 학생 전화번호 */
  studentPhone: phoneSchema,
  /** 학부모 전화번호 */
  parentPhone: phoneSchema,
  /** 등록일시 */
  registeredAt: dateTimeSchema.optional(),
});

/** 강의 수강 정보 DTO 타입 */
export type LectureEnrollmentDto = z.infer<typeof lectureEnrollmentSchema>;

/**
 * 강의 생성 요청 검증 스키마
 */
export const createLectureSchema = z
  .object({
    /** 강의 제목 */
    title: z
      .string()
      .min(1, { message: '강의 제목은 필수입니다.' })
      .max(LectureLimits.TITLE_MAX_LENGTH, {
        message: `강의 제목은 ${LectureLimits.TITLE_MAX_LENGTH}자를 초과할 수 없습니다.`,
      })
      .trim(),

    /** 대상 학년 */
    schoolYear: z
      .enum(SCHOOL_YEARS, { message: '유효한 학년이 아닙니다.' })
      .optional(),

    /** 과목 */
    subject: z
      .string()
      .max(LectureLimits.SUBJECT_MAX_LENGTH, {
        message: `과목명은 ${LectureLimits.SUBJECT_MAX_LENGTH}자를 초과할 수 없습니다.`,
      })
      .trim()
      .optional(),

    /** 강의 설명 */
    description: z
      .string()
      .max(LectureLimits.DESCRIPTION_MAX_LENGTH, {
        message: `설명은 ${LectureLimits.DESCRIPTION_MAX_LENGTH}자를 초과할 수 없습니다.`,
      })
      .trim()
      .optional(),

    /** 강의 시작일 */
    startAt: dateTimeSchema.optional().nullable(),

    /** 강의 종료일 */
    endAt: dateTimeSchema.optional().nullable(),

    /** 강의 상태 (예정, 진행중, 종료) */
    status: z
      .nativeEnum(LectureStatus)
      .optional()
      .default(LectureStatus.SCHEDULED),

    /** 수업 시간 목록 */
    lectureTimes: z.array(lectureTimeItemSchema).optional(),

    /** 수강 등록 목록 (강의 생성 시 동시 등록용) */
    enrollments: z.array(lectureEnrollmentSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.enrollments) return;

    const seenStudentPhoneIndexes = new Map<string, number>();

    data.enrollments.forEach((enrollment, index) => {
      const firstIndex = seenStudentPhoneIndexes.get(enrollment.studentPhone);

      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '중복된 학생 전화번호는 허용되지 않습니다.',
          path: ['enrollments', index, 'studentPhone'],
        });
        return;
      }

      seenStudentPhoneIndexes.set(enrollment.studentPhone, index);
    });
  });

/** 강의 생성 DTO 타입 */
export type CreateLectureDto = z.infer<typeof createLectureSchema>;
/** 강사 ID 포함 강의 생성 DTO 타입 */
export type CreateLectureWithInstructorIdDto = CreateLectureDto & {
  instructorId: string;
};

/**
 * 강의 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getLecturesQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(PaginationDefaults.PAGE),
  /** 페이지당 항목 수 */
  limit: z.coerce
    .number()
    .min(1)
    .max(PaginationDefaults.MAX_LIMIT)
    .default(PaginationDefaults.LIMIT),
  /** 검색어 (제목 등) */
  search: z.string().trim().optional(),
  /** 요일 필터 (0: 일요일 ~ 6: 토요일) */
  day: z.coerce.number().min(0).max(6).optional(),
});

/** 강의 목록 조회 쿼리 DTO 타입 */
export type GetLecturesQueryDto = z.infer<typeof getLecturesQuerySchema>;

/**
 * 강의 ID 경로 파라미터 검증 스키마
 */
export const lectureParamSchema = z.object({
  /** 강의 ID */
  id: z.string().min(1, { message: '강의 ID는 필수입니다.' }),
});

/** 강의 ID 파라미터 DTO 타입 */
export type LectureParamDto = z.infer<typeof lectureParamSchema>;

/**
 * 강의 ID 경로 파라미터 검증 스키마 (lectureId 명칭 사용)
 */
export const lectureIdParamSchema = z.object({
  /** 강의 ID */
  lectureId: z.string().min(1, { message: '강의 ID는 필수입니다.' }),
});

/** 강의 ID 파라미터 DTO 타입 */
export type LectureIdParamDto = z.infer<typeof lectureIdParamSchema>;

/**
 * 강의 수정 요청 검증 스키마
 */
export const updateLectureSchema = z.object({
  /** 강의 제목 */
  title: z
    .string()
    .min(1, { message: '강의 제목은 필수입니다.' })
    .max(LectureLimits.TITLE_MAX_LENGTH, {
      message: `강의 제목은 ${LectureLimits.TITLE_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  /** 대상 학년 */
  schoolYear: z
    .enum(SCHOOL_YEARS, { message: '유효한 학년이 아닙니다.' })
    .optional(),

  /** 과목 */
  subject: z
    .string()
    .max(LectureLimits.SUBJECT_MAX_LENGTH, {
      message: `과목명은 ${LectureLimits.SUBJECT_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  /** 강의 설명 */
  description: z
    .string()
    .max(LectureLimits.DESCRIPTION_MAX_LENGTH, {
      message: `설명은 ${LectureLimits.DESCRIPTION_MAX_LENGTH}자를 초과할 수 없습니다.`,
    })
    .trim()
    .optional(),

  /** 강의 시작일 */
  startAt: dateTimeSchema.optional().nullable(),

  /** 강의 종료일 */
  endAt: dateTimeSchema.optional().nullable(),

  /** 강의 상태 */
  status: z.nativeEnum(LectureStatus).optional(),

  /** 수업 시간 목록 */
  lectureTimes: z.array(lectureTimeItemSchema).optional(),
});

/** 강의 수정 DTO 타입 */
export type UpdateLectureDto = z.infer<typeof updateLectureSchema>;

/**
 * 강의 삭제 요청 검증 스키마
 */
export const deleteLectureSchema = z.object({});

/** 강의 삭제 DTO 타입 */
export type DeleteLectureDto = z.infer<typeof deleteLectureSchema>;
