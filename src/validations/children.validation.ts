import { z } from 'zod';

export const createChildSchema = z.object({
  name: z.string().min(1, '자녀 이름은 필수입니다.'),
  phoneNumber: z
    .string()
    .regex(
      /^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$/,
      '유효한 전화번호 형식이 아닙니다.',
    ),
});

export type CreateChildDto = z.infer<typeof createChildSchema>;

/** 자녀 ID 파라미터 스키마 */
export const childIdParamSchema = z.object({
  id: z.string().min(1, '자녀 ID는 필수입니다.'),
});
