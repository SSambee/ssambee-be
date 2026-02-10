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
