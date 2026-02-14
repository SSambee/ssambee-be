import { z } from 'zod';
import { Regex } from '../constants/regex.constant.js';

/** 전화번호 검증 스키마 */
const phoneSchema = z
  .string()
  .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.');

/**
 * 자녀 등록 요청 검증 스키마 (학부모용)
 */
export const createChildSchema = z.object({
  /** 자녀 이름 */
  name: z.string().min(1, '자녀 이름은 필수입니다.'),
  /** 자녀 전화번호 */
  phoneNumber: phoneSchema,
});

/** 자녀 등록 DTO 타입 */
export type CreateChildDto = z.infer<typeof createChildSchema>;

/**
 * 자녀 관련 ID 경로 파라미터 검증 스키마
 */
export const childIdParamSchema = z.object({
  /** 자녀 ID */
  id: z.string().min(1, '자녀 ID는 필수입니다.'),
  /** 강의 수강 ID (선택) */
  lectureEnrollmentId: z.string().optional(),
  /** 성적 ID (선택) */
  gradeId: z.string().optional(),
});
