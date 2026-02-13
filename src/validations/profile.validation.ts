import { z } from 'zod';

export const updateMyProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  subject: z.string().optional(), // 강사 전용
  academy: z.string().optional(), // 강사 전용
});

export type UpdateMyProfileDto = z.infer<typeof updateMyProfileSchema>;
