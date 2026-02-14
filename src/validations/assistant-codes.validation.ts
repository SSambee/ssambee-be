import { z } from 'zod';

/**
 * 조교 가입 코드 생성 요청 검증 스키마
 */
export const createAssistantCodeSchema = z.object({});

/**
 * 조교 가입 코드 검증 요청 검증 스키마
 */
export const validateAssistantCodeSchema = z.object({
  /** 가입 코드 (6자리) */
  code: z.string().length(6, '코드는 6자리여야 합니다.'),
});

/** 조교 가입 코드 검증 DTO 타입 */
export type ValidateAssistantCodeDto = z.infer<
  typeof validateAssistantCodeSchema
>;
