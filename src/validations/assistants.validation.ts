import { z } from 'zod';

export const getAssistantsQuerySchema = z.object({
  status: z.enum(['pending', 'signed', 'expired', 'denied']).optional(),
});

export type GetAssistantsQueryDto = z.infer<typeof getAssistantsQuerySchema>;
