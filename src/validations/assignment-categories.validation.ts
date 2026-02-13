import { z } from 'zod';

/** 과제 카테고리 생성 스키마 */
export const createAssignmentCategorySchema = z.object({
  name: z.string().min(1, '카테고리 이름은 필수입니다.'),
  resultPresets: z
    .array(z.string().min(1, '결과 패턴은 빈 문자열일 수 없습니다.'))
    .min(1, '최소 1개 이상의 결과 패턴이 필요합니다.')
    .refine((items) => new Set(items).size === items.length, {
      message: '결과 패턴에 중복된 값이 있습니다.',
    }),
});

/** 과제 카테고리 수정 스키마 */
export const updateAssignmentCategorySchema = z
  .object({
    name: z
      .string()
      .min(1, '카테고리 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
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

/** 과제 카테고리 ID 파라미터 스키마 */
export const assignmentCategoryIdParamSchema = z.object({
  id: z.string().uuid('올바른 카테고리 ID 형식이 아닙니다.'),
});

export type CreateAssignmentCategoryDto = z.infer<
  typeof createAssignmentCategorySchema
>;
export type UpdateAssignmentCategoryDto = z.infer<
  typeof updateAssignmentCategorySchema
>;
