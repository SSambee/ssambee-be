import { z } from 'zod';

/**
 * 댓글 작성 요청 검증 스키마
 */
export const createCommentSchema = z
  .object({
    /** 댓글 내용 */
    content: z.string().min(1, '내용은 필수입니다.'),
    /** 첨부 자료 ID 목록 (선택) */
    materialIds: z.array(z.cuid2()).optional(),
    /** 강사 게시물 ID (강사 게시물에 댓글 작성 시) */
    instructorPostId: z.cuid2().optional(),
    /** 학생 질문 게시물 ID (학생 질문에 댓글 작성 시) */
    studentPostId: z.cuid2().optional(),
    /** 부모 댓글 ID (대댓글 작성 시) */
    parentId: z.cuid2().optional(),
  })
  .refine((d) => !(d.instructorPostId && d.studentPostId), {
    message: 'instructorPostId와 studentPostId를 동시에 지정할 수 없습니다.',
  });

/**
 * 댓글 수정 요청 검증 스키마
 */
export const updateCommentSchema = z.object({
  /** 수정할 내용 */
  content: z.string().min(1, '내용은 필수입니다.'),
  /** 수정할 첨부 자료 ID 목록 (선택) */
  materialIds: z.array(z.cuid2()).optional(),
});

/**
 * 댓글 ID 경로 파라미터 검증 스키마
 */
export const commentParamsSchema = z.object({
  /** 댓글 ID */
  commentId: z.cuid2(),
});

/**
 * 게시물 및 댓글 ID 경로 파라미터 검증 스키마
 */
export const commentEditParamsSchema = z.object({
  /** 게시물 ID */
  postId: z.cuid2(),
  /** 댓글 ID */
  commentId: z.cuid2(),
});

/** 댓글 작성 DTO 타입 */
export type CreateCommentDto = z.infer<typeof createCommentSchema>;
/** 댓글 수정 DTO 타입 */
export type UpdateCommentDto = z.infer<typeof updateCommentSchema>;
/** 댓글 파라미터 DTO 타입 */
export type CommentParamsDto = z.infer<typeof commentParamsSchema>;
/** 댓글 수정 파라미터 DTO 타입 */
export type CommentEditParamsDto = z.infer<typeof commentEditParamsSchema>;
