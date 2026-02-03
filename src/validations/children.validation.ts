import { z } from 'zod';
import { Regex } from '../constants/regex.constant.js';

const phoneSchema = z
  .string()
  .regex(Regex.PHONE, '유효한 전화번호 형식이 아닙니다.');

export const createChildSchema = z.object({
  name: z.string().min(1, '자녀 이름은 필수입니다.'),
  phoneNumber: phoneSchema,
});

export type CreateChildDto = z.infer<typeof createChildSchema>;

/** 자녀 ID 파라미터 스키마 */
export const childIdParamSchema = z.object({
  id: z.string().min(1, '자녀 ID는 필수입니다.'),
  lectureEnrollmentId: z.string().optional(),
  gradeId: z.string().optional(),
});
