import { z } from 'zod';

/**
 * 내 프로필 수정 요청 검증 스키마
 */
export const updateMyProfileSchema = z.object({
  /** 이름 */
  name: z.string().min(1).optional(),
  /** 전화번호 */
  phoneNumber: z.string().optional(),
  /** 담당 과목 (강사 전용) */
  subject: z.string().optional(),
  /** 소속 학원 (강사 전용) */
  academy: z.string().optional(),

  /** 소속 학교 (학생 전용) */
  school: z.string().optional(),
  /** 학년 (학생 전용) */
  schoolYear: z.string().optional(),
});

/** 내 프로필 수정 DTO 타입 */
export type UpdateMyProfileDto = z.infer<typeof updateMyProfileSchema>;
