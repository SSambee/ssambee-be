import { z } from 'zod';
import { PostScope, TargetRole } from '../constants/posts.constant.js';
import { PostType } from '../constants/posts.constant.js';

export const createInstructorPostSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.'),
  content: z.string().min(1, '내용은 필수입니다.'),
  isImportant: z.boolean().default(false).optional(),
  scope: z.enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED]),
  targetRole: z
    .enum([TargetRole.ALL, TargetRole.STUDENT, TargetRole.PARENT])
    .default(TargetRole.ALL)
    .optional(),

  // Lecture Scope일 때 필수 (하지만 Global일 수도 있으므로 optional 처리 후 service에서 검증)
  lectureId: z.cuid2().nullable().optional(),

  // Selected Scope일 때 필수
  targetEnrollmentIds: z.array(z.cuid2()).nullable().optional(),

  materialIds: z.array(z.cuid2()).nullable().optional(),
});

export const updateInstructorPostSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isImportant: z.boolean().optional(),
  scope: z
    .enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED])
    .optional(),
  targetRole: z
    .enum([TargetRole.ALL, TargetRole.STUDENT, TargetRole.PARENT])
    .optional(),

  lectureId: z.cuid2().nullable().optional(),
  targetEnrollmentIds: z.array(z.cuid2()).nullable().optional(),
  materialIds: z.array(z.cuid2()).nullable().optional(),
});

export const getInstructorPostsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  lectureId: z.cuid2().optional(),
  scope: z
    .enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED])
    .optional(),
  search: z.string().optional(),
  // 게시물 유형 필터: 공지/자료
  postType: z.enum([PostType.NOTICE, PostType.SHARE]).optional(),
});

export const instructorPostParamsSchema = z.object({
  postId: z.cuid2(),
});

export type CreateInstructorPostDto = z.infer<
  typeof createInstructorPostSchema
>;
export type UpdateInstructorPostDto = z.infer<
  typeof updateInstructorPostSchema
>;
export type GetInstructorPostsQueryDto = z.infer<
  typeof getInstructorPostsQuerySchema
>;

export const getPostTargetsQuerySchema = z.object({
  lectureId: z.cuid2(),
});

export type GetPostTargetsQueryDto = z.infer<typeof getPostTargetsQuerySchema>;
