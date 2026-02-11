import { z } from 'zod';

/** 16진수 색상 코드 정규식 */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** 카테고리 생성 스키마 */
export const createScheduleCategorySchema = z.object({
  name: z.string().min(1, '카테고리 이름은 필수입니다.'),
  color: z
    .string()
    .regex(
      HEX_COLOR_REGEX,
      '올바른 16진수 색상 코드가 아닙니다. (예: #PH1234)',
    ),
});

/** 카테고리 수정 스키마 */
export const updateScheduleCategorySchema = z
  .object({
    name: z
      .string()
      .min(1, '카테고리 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
    color: z
      .string()
      .regex(
        HEX_COLOR_REGEX,
        '올바른 16진수 색상 코드가 아닙니다. (예: #PH1234)',
      )
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.color !== undefined, {
    message: '이름 또는 색상 중 하나는 반드시 포함되어야 합니다.',
  });

/** 카테고리 ID 파라미터 스키마 */
export const scheduleCategoryIdParamSchema = z.object({
  id: z.string().cuid2('올바른 카테고리 ID 형식이 아닙니다.'),
});

export type CreateScheduleCategoryDto = z.infer<
  typeof createScheduleCategorySchema
>;
export type UpdateScheduleCategoryDto = z.infer<
  typeof updateScheduleCategorySchema
>;
