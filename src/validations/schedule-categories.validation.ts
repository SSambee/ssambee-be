import { z } from 'zod';

/** 16진수 색상 코드 정규식 (예: #FFFFFF) */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * 일정 카테고리 생성 요청 검증 스키마
 */
export const createScheduleCategorySchema = z.object({
  /** 카테고리 이름 */
  name: z.string().min(1, '카테고리 이름은 필수입니다.'),
  /** 카테고리 색상 (16진수 HEX 코드) */
  color: z
    .string()
    .regex(
      HEX_COLOR_REGEX,
      '올바른 16진수 색상 코드가 아닙니다. (예: #FF0000)',
    ),
});

/**
 * 일정 카테고리 수정 요청 검증 스키마
 */
export const updateScheduleCategorySchema = z
  .object({
    /** 카테고리 이름 */
    name: z
      .string()
      .min(1, '카테고리 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
    /** 카테고리 색상 */
    color: z
      .string()
      .regex(
        HEX_COLOR_REGEX,
        '올바른 16진수 색상 코드가 아닙니다. (예: #FF0000)',
      )
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: '이름 또는 색상 중 하나는 반드시 포함되어야 합니다.',
  });

/**
 * 일정 카테고리 ID 경로 파라미터 검증 스키마
 */
export const scheduleCategoryIdParamSchema = z.object({
  /** 카테고리 ID (CUID2) */
  id: z.string().cuid2('올바른 카테고리 ID 형식이 아닙니다.'),
});

/** 일정 카테고리 생성 DTO 타입 */
export type CreateScheduleCategoryDto = z.infer<
  typeof createScheduleCategorySchema
>;
/** 일정 카테고리 수정 DTO 타입 */
export type UpdateScheduleCategoryDto = z.infer<
  typeof updateScheduleCategorySchema
>;
