import { z } from 'zod';

export const createCommentSchema = z.object({
  content: z.string().min(1, '내용은 필수입니다.'),
  materialIds: z.array(z.cuid2()).optional(),
});

export const commentParamsSchema = z.object({
  commentId: z.cuid2(),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
