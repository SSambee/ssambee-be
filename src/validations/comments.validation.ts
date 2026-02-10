import { z } from 'zod';

export const createCommentSchema = z.object({
  content: z.string().min(1, '내용은 필수입니다.'),
  materialIds: z.array(z.cuid2()).optional(),
  instructorPostId: z.cuid2().optional(),
  studentPostId: z.cuid2().optional(),
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, '내용은 필수입니다.'),
  materialIds: z.array(z.cuid2()).optional(),
});

export const commentParamsSchema = z.object({
  commentId: z.cuid2(),
});

export const commentEditParamsSchema = z.object({
  postId: z.cuid2(),
  commentId: z.cuid2(),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
export type UpdateCommentDto = z.infer<typeof updateCommentSchema>;
export type CommentParamsDto = z.infer<typeof commentParamsSchema>;
export type CommentEditParamsDto = z.infer<typeof commentEditParamsSchema>;
