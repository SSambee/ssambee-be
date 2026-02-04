import { z } from 'zod';
import {
  SCHOOL_YEARS,
  EnrollmentStatus,
} from '../constants/enrollments.constant.js';
import { PaginationDefaults } from '../constants/common.constant.js';
import { Regex } from '../constants/regex.constant.js';

// ... (other imports if any, but since I am replacing line 1-24 mainly to insert import and update schema)

/** Enrollment ID 파라미터 스키마 */
export const enrollmentIdParamSchema = z.object({
  enrollmentId: z
    .string()
    .trim()
    .min(1, { message: 'Enrollment ID는 필수입니다.' }),
});

export type EnrollmentIdParamDto = z.infer<typeof enrollmentIdParamSchema>;

/** Lecture Enrollment ID 파라미터 스키마 (학생용) */
export const lectureEnrollmentIdParamSchema = z.object({
  lectureEnrollmentId: z
    .string()
    .trim()
    .min(1, { message: 'Lecture Enrollment ID는 필수입니다.' }),
});

export type LectureEnrollmentIdParamDto = z.infer<
  typeof lectureEnrollmentIdParamSchema
>;

/** 수강 등록 스키마 */
export const createEnrollmentSchema = z.object({
  school: z.string().trim().min(1, '학교명은 필수입니다.'),
  schoolYear: z.enum([...SCHOOL_YEARS] as [string, ...string[]]),
  studentName: z.string().trim().min(1, '학생 이름은 필수입니다.'),
  studentEmail: z.string().email().optional(),
  studentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.'),
  parentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.'),
  memo: z.string().optional(),
});

export type CreateEnrollmentDto = z.infer<typeof createEnrollmentSchema>;

/** 수강 정보 수정 스키마 */
export const updateEnrollmentSchema = z.object({
  school: z.string().trim().min(1, '학교명은 필수입니다.').optional(),
  schoolYear: z.enum([...SCHOOL_YEARS] as [string, ...string[]]).optional(),
  studentName: z.string().trim().min(1, '학생 이름은 필수입니다.').optional(),
  studentEmail: z.string().email().optional(),
  studentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.')
    .optional(),
  parentPhone: z
    .string()
    .trim()
    .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.')
    .optional(),
  memo: z.string().optional(),
  status: z.nativeEnum(EnrollmentStatus).optional(),
});

export type UpdateEnrollmentDto = z.infer<typeof updateEnrollmentSchema>;

/** 수강생 목록 조회 쿼리 스키마 */
import { paginationQuerySchema } from './common.validation.js';

/** 수강생 목록 조회 쿼리 스키마 */
export const getEnrollmentsQuerySchema = paginationQuerySchema.extend({
  keyword: z.string().trim().optional(), // 이름, 학교, 전화번호 검색
  year: z.enum([...SCHOOL_YEARS] as [string, ...string[]]).optional(), // 학년 필터 (ex: 중1, 고3)
  status: z.nativeEnum(EnrollmentStatus).optional(), // 상태 필터
  lecture: z.string().optional(), // 특정 강의 필터 (선택 사항)
  examId: z.string().optional(), // 특정 시험 성적 포함 필터
});

export type GetEnrollmentsQueryDto = z.infer<typeof getEnrollmentsQuerySchema>;

/** 학생/학부모용 수강 내역 조회 쿼리 스키마 (Lectures API와 동일) */
export const getSvcEnrollmentsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(PaginationDefaults.PAGE),
  limit: z.coerce
    .number()
    .min(1)
    .max(PaginationDefaults.MAX_LIMIT)
    .default(PaginationDefaults.LIMIT),
  keyword: z.string().trim().optional(),
});

export type GetSvcEnrollmentsQueryDto = z.infer<
  typeof getSvcEnrollmentsQuerySchema
>;

/** 수강 마이그레이션(일괄 등록) 스키마 */
export const createEnrollmentMigrationSchema = z.object({
  enrollmentIds: z
    .array(z.string().trim().min(1))
    .min(1, '최소 1개의 선택된 학생이 필요합니다.'),
  memo: z.string().optional(),
});

export type CreateEnrollmentMigrationDto = z.infer<
  typeof createEnrollmentMigrationSchema
>;
