import { z } from 'zod';

export const createAssistantOrderSchema = z.object({
  assistantId: z.string().min(1, '조교 ID는 필수입니다.'),
  title: z.string().min(1, '지시 제목은 필수입니다.'),
  memo: z.string().optional(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  materialIds: z.array(z.string()).optional(),
  lectureId: z.string().optional(),
  deadlineAt: z.string().datetime().optional(),
});

export type CreateAssistantOrderDto = z.infer<
  typeof createAssistantOrderSchema
>;

export const getAssistantOrdersQuerySchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'END']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type GetAssistantOrdersQueryDto = z.infer<
  typeof getAssistantOrdersQuerySchema
>;

export const updateAssistantOrderSchema = z.object({
  title: z.string().min(1, '지시 제목은 필수입니다.').optional(),
  memo: z.string().optional(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'END']).optional(),
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  lectureId: z.string().optional(),
  deadlineAt: z.string().datetime().optional(),
  materialIds: z.array(z.string()).optional(),
});

export type UpdateAssistantOrderDto = z.infer<
  typeof updateAssistantOrderSchema
>;

export const updateAssistantOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'END']),
});

export type UpdateAssistantOrderStatusDto = z.infer<
  typeof updateAssistantOrderStatusSchema
>;

export const assistantOrderIdParamSchema = z.object({
  id: z.string().min(1, 'ID는 필수입니다.'),
});
