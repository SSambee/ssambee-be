import { z } from 'zod';

export const updateMyProfileSchema = z.object({
  name: z.string().min(1).optional(),
  phoneNumber: z.string().optional(),
  subject: z.string().optional(), // 강사 전용
  academy: z.string().optional(), // 강사 전용

  // 학생 전용
  school: z.string().optional(),
  schoolYear: z.string().optional(),
});

export type UpdateMyProfileDto = z.infer<typeof updateMyProfileSchema>;
