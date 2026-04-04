import { z } from 'zod';

export const inviteAdminSchema = z.object({
  email: z.string().email('유효한 이메일 형식이 아닙니다.'),
  name: z.string().trim().min(2, '이름은 최소 2자 이상이어야 합니다.'),
});

export type InviteAdminDto = z.infer<typeof inviteAdminSchema>;
