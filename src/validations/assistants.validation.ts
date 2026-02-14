import { z } from 'zod';

/**
 * 조교 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getAssistantsQuerySchema = z.object({
  /** 상태별 필터링 (대기, 승인됨, 만료됨, 거절됨) */
  status: z.enum(['pending', 'signed', 'expired', 'rejected']).optional(),
});

/** 조교 목록 조회 쿼리 DTO 타입 */
export type GetAssistantsQueryDto = z.infer<typeof getAssistantsQuerySchema>;

/**
 * 조교 정보 수정 경로 파라미터 검증 스키마
 */
export const updateAssistantParamsSchema = z.object({
  /** 조교 ID */
  id: z.string().min(1),
});

/**
 * 조교 정보 수정 요청 바디 검증 스키마
 */
export const updateAssistantBodySchema = z.object({
  /** 이름 */
  name: z.string().min(1).optional(),
  /** 전화번호 */
  phoneNumber: z.string().optional(),
  /** 계약 정보 */
  contract: z.string().optional(),
  /** 메모 */
  memo: z.string().optional(),
});

/**
 * 조교 승인/거절 요청 쿼리 파라미터 검증 스키마
 */
export const updateAssistantQuerySchema = z.object({
  /** 수행할 액션 (승인, 거절, 만료) */
  sign: z.enum(['approve', 'reject', 'expire']).optional(),
});

/** 조교 정보 수정 경로 파라미터 DTO 타입 */
export type UpdateAssistantParamsDto = z.infer<
  typeof updateAssistantParamsSchema
>;
/** 조교 정보 수정 바디 DTO 타입 */
export type UpdateAssistantBodyDto = z.infer<typeof updateAssistantBodySchema>;
/** 조교 승인/거절 쿼리 DTO 타입 */
export type UpdateAssistantQueryDto = z.infer<
  typeof updateAssistantQuerySchema
>;
