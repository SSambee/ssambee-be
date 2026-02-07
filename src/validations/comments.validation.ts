import { z } from 'zod';

export const createCommentSchema = z
  .object({
    content: z.string().min(1, '내용은 필수입니다.'),

    // 어느 게시글에 대한 댓글인지
    instructorPostId: z.cuid2().optional(),
    studentPostId: z.cuid2().optional(),

    materialIds: z.array(z.cuid2()).optional(),
  })
  .refine((data) => data.instructorPostId || data.studentPostId, {
    message:
      '게시글 ID(instructorPostId 또는 studentPostId) 중 하나는 필수입니다.',
    path: ['instructorPostId'],
  });

export const commentParamsSchema = z.object({
  commentId: z.cuid2(),
});

export type CreateCommentDto = z.infer<typeof createCommentSchema>;
