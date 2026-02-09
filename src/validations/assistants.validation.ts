import { z } from 'zod';

export const getAssistantsQuerySchema = z.object({
  status: z.enum(['pending', 'signed', 'expired', 'rejected']).optional(),
});

export type GetAssistantsQueryDto = z.infer<typeof getAssistantsQuerySchema>;

// 파라미터 검증
export const updateAssistantParamsSchema = z.object({
  id: z.string().min(1),
});

// Body 검증 (조교 정보 수정용)
export const updateAssistantBodySchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  contract: z.string().optional(),
  memo: z.string().optional(),
});

// Query 검증 (sign 액션용)
export const updateAssistantQuerySchema = z.object({
  sign: z.enum(['approve', 'reject', 'expire']).optional(),
});

export type UpdateAssistantParamsDto = z.infer<
  typeof updateAssistantParamsSchema
>;
export type UpdateAssistantBodyDto = z.infer<typeof updateAssistantBodySchema>;
export type UpdateAssistantQueryDto = z.infer<
  typeof updateAssistantQuerySchema
>;
