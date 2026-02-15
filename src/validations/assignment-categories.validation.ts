import { z } from 'zod';

/**
 * 과제 카테고리 생성 요청 검증 스키마
 */
export const createAssignmentCategorySchema = z.object({
  /** 카테고리 이름 */
  name: z.string().min(1, '카테고리 이름은 필수입니다.'),
  /** 결과 프리셋 목록 (과제 결과로 선택 가능한 옵션들) */
  resultPresets: z
    .array(z.string().min(1, '결과 패턴은 빈 문자열일 수 없습니다.'))
    .min(1, '최소 1개 이상의 결과 패턴이 필요합니다.')
    .refine((items) => new Set(items).size === items.length, {
      message: '결과 패턴에 중복된 값이 있습니다.',
    }),
});

/**
 * 과제 카테고리 수정 요청 검증 스키마
 */
export const updateAssignmentCategorySchema = z
  .object({
    /** 카테고리 이름 */
    name: z
      .string()
      .min(1, '카테고리 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
    /** 결과 프리셋 목록 */
    resultPresets: z
      .array(z.string().min(1, '결과 패턴은 빈 문자열일 수 없습니다.'))
      .min(1, '최소 1개 이상의 결과 패턴이 필요합니다.')
      .refine((items) => new Set(items).size === items.length, {
        message: '결과 패턴에 중복된 값이 있습니다.',
      })
      .optional(),
  })
  .refine(
    (data) => data.name !== undefined || data.resultPresets !== undefined,
    {
      message: '이름 또는 결과 패턴 중 하나는 반드시 포함되어야 합니다.',
    },
  );

/**
 * 과제 카테고리 ID 경로 파라미터 검증 스키마
 */
export const assignmentCategoryIdParamSchema = z.object({
  /** 카테고리 ID */
  id: z.string().uuid('올바른 카테고리 ID 형식이 아닙니다.'),
});

/** 과제 카테고리 생성 DTO 타입 */
export type CreateAssignmentCategoryDto = z.infer<
  typeof createAssignmentCategorySchema
>;
/** 과제 카테고리 수정 DTO 타입 */
export type UpdateAssignmentCategoryDto = z.infer<
  typeof updateAssignmentCategorySchema
>;
