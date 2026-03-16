import { z } from 'zod';
import {
  SCHOOL_YEARS,
  EnrollmentStatus,
} from '../constants/enrollments.constant.js';
import { PaginationDefaults } from '../constants/common.constant.js';
import { Regex } from '../constants/regex.constant.js';
import { dateTimeSchema, paginationQuerySchema } from './common.validation.js';

/**
 * 수강 ID 경로 파라미터 검증 스키마
 */
export const enrollmentIdParamSchema = z.object({
  /** 수강 ID */
  enrollmentId: z
    .string()
    .trim()
    .min(1, { message: 'Enrollment ID는 필수입니다.' }),
});

/** 수강 ID 파라미터 DTO 타입 */
export type EnrollmentIdParamDto = z.infer<typeof enrollmentIdParamSchema>;

/**
 * 강의 수강 ID 경로 파라미터 검증 스키마 (학생용)
 */
export const lectureEnrollmentIdParamSchema = z.object({
  /** 강의 수강 ID */
  lectureEnrollmentId: z
    .string()
    .trim()
    .min(1, { message: 'Lecture Enrollment ID는 필수입니다.' }),
});

/** 강의 수강 ID 파라미터 DTO 타입 */
export type LectureEnrollmentIdParamDto = z.infer<
  typeof lectureEnrollmentIdParamSchema
>;

/**
 * 수강 등록 요청 검증 스키마
 */
export const createEnrollmentSchema = z.object({
  /** 학교명 */
  school: z.string().trim().min(1, '학교명은 필수입니다.'),
  /** 학년 */
  schoolYear: z.enum([...SCHOOL_YEARS] as [string, ...string[]]),
  /** 학생 이름 */
  studentName: z.string().trim().min(1, '학생 이름은 필수입니다.'),
  /** 학생 이메일 (선택) */
  studentEmail: z.string().email().optional(),
  /** 학생 전화번호 */
  studentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.'),
  /** 학부모 전화번호 */
  parentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.'),
  /** 메모 (선택) */
  memo: z.string().optional(),
  /** 등록일시 (선택) */
  registeredAt: dateTimeSchema.optional(),
});

/** 수강 등록 DTO 타입 */
export type CreateEnrollmentDto = z.infer<typeof createEnrollmentSchema>;

/**
 * 수강 정보 수정 요청 검증 스키마
 */
export const updateEnrollmentSchema = z.object({
  /** 학교명 */
  school: z.string().trim().min(1, '학교명은 필수입니다.').optional(),
  /** 학년 */
  schoolYear: z.enum([...SCHOOL_YEARS] as [string, ...string[]]).optional(),
  /** 학생 이름 */
  studentName: z.string().trim().min(1, '학생 이름은 필수입니다.').optional(),
  /** 학생 이메일 */
  studentEmail: z.string().email().optional(),
  /** 학생 전화번호 */
  studentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.')
    .optional(),
  /** 학부모 전화번호 */
  parentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.')
    .optional(),
  /** 메모 */
  memo: z.string().optional(),
  /** 등록일시 */
  registeredAt: dateTimeSchema.optional(),
  /** 수강 상태 */
  status: z.nativeEnum(EnrollmentStatus).optional(),
});

/** 수강 정보 수정 DTO 타입 */
export type UpdateEnrollmentDto = z.infer<typeof updateEnrollmentSchema>;

/**
 * 수강생 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getEnrollmentsQuerySchema = paginationQuerySchema.extend({
  /** 검색 키워드 (이름, 학교, 전화번호) */
  keyword: z.string().trim().optional(),
  /** 학년 필터 */
  year: z.enum([...SCHOOL_YEARS] as [string, ...string[]]).optional(),
  /** 수강 상태 필터 */
  status: z.nativeEnum(EnrollmentStatus).optional(),
  /** 특정 강의 필터 */
  lecture: z.string().optional(),
  /** 특정 시험 ID 필터 (해당 시험 성적 포함) */
  examId: z.string().optional(),
});

/** 수강생 목록 조회 쿼리 DTO 타입 */
export type GetEnrollmentsQueryDto = z.infer<typeof getEnrollmentsQuerySchema>;

/**
 * 학생/학부모용 수강 내역 조회 쿼리 파라미터 검증 스키마
 */
export const getSvcEnrollmentsQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(PaginationDefaults.PAGE),
  /** 페이지당 항목 수 */
  limit: z.coerce
    .number()
    .min(1)
    .max(PaginationDefaults.MAX_LIMIT)
    .default(PaginationDefaults.LIMIT),
  /** 검색 키워드 */
  keyword: z.string().trim().optional(),
});

/** 학생/학부모용 수강 내역 조회 쿼리 DTO 타입 */
export type GetSvcEnrollmentsQueryDto = z.infer<
  typeof getSvcEnrollmentsQuerySchema
>;

/**
 * 수강 마이그레이션(일괄 등록) 요청 검증 스키마
 */
export const createEnrollmentMigrationSchema = z.object({
  /** 마이그레이션할 수강 ID 목록 */
  enrollmentIds: z
    .array(z.string().trim().min(1))
    .min(1, '최소 1개의 선택된 학생이 필요합니다.'),
  /** 메모 */
  memo: z.string().optional(),
});

/** 수강 마이그레이션 DTO 타입 */
export type CreateEnrollmentMigrationDto = z.infer<
  typeof createEnrollmentMigrationSchema
>;
