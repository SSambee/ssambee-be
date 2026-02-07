import { z } from 'zod';
import { PostScope, TargetRole } from '../constants/posts.constant.js';

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
  lectureId: z.cuid2().optional(),

  // Selected Scope일 때 필수
  targetEnrollmentIds: z.array(z.cuid2()).optional(),

  materialIds: z.array(z.cuid2()).optional(),
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

  // 타겟이나 첨부파일 수정은 별도 API로 분리하거나 여기서 처리할 수 있음
  // 일단 간단히 메타데이터 수정만 정의
});

export const getInstructorPostsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  lectureId: z.cuid2().optional(),
  scope: z
    .enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED])
    .optional(),
  search: z.string().optional(),
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
