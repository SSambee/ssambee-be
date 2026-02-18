import { z } from 'zod';
import { PostScope, TargetRole } from '../constants/posts.constant.js';
import { PostType } from '../constants/posts.constant.js';

/**
 * 강사 게시물 작성 요청 검증 스키마
 */
export const createInstructorPostSchema = z.object({
  /** 제목 */
  title: z.string().min(1, '제목은 필수입니다.'),
  /** 내용 */
  content: z.string().min(1, '내용은 필수입니다.'),
  /** 중요 공지 여부 */
  isImportant: z.boolean().default(false).optional(),
  /** 공개 범위 (전체, 강의별, 선택된 학생) */
  scope: z.enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED]),
  /** 대상 역할 (전체, 학생, 학부모) */
  targetRole: z
    .enum([TargetRole.ALL, TargetRole.STUDENT, TargetRole.PARENT])
    .default(TargetRole.ALL)
    .optional(),

  /** 강의 ID (강의별 공개 시 필수) */
  lectureId: z.cuid2().nullable().optional(),

  /** 대상 수강 ID 목록 (선택된 학생 공개 시 필수) */
  targetEnrollmentIds: z.array(z.cuid2()).nullable().optional(),

  /** 첨부 자료 ID 목록 */
  materialIds: z.array(z.cuid2()).nullable().optional(),
});

/**
 * 강사 게시물 수정 요청 검증 스키마
 */
export const updateInstructorPostSchema = z.object({
  /** 제목 */
  title: z.string().min(1).optional(),
  /** 내용 */
  content: z.string().min(1).optional(),
  /** 중요 공지 여부 */
  isImportant: z.boolean().optional(),
  /** 공개 범위 */
  scope: z
    .enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED])
    .optional(),
  /** 대상 역할 */
  targetRole: z
    .enum([TargetRole.ALL, TargetRole.STUDENT, TargetRole.PARENT])
    .optional(),

  /** 강의 ID */
  lectureId: z.cuid2().nullable().optional(),
  /** 대상 수강 ID 목록 */
  targetEnrollmentIds: z.array(z.cuid2()).nullable().optional(),
  /** 첨부 자료 ID 목록 */
  materialIds: z.array(z.cuid2()).nullable().optional(),
});

/**
 * 강사 게시물 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getInstructorPostsQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(1),
  /** 페이지당 항목 수 */
  limit: z.coerce.number().min(1).max(50).default(20),
  /** 특정 강의 ID 필터 */
  lectureId: z.cuid2().optional(),
  /** 공개 범위 필터 */
  scope: z
    .enum([PostScope.GLOBAL, PostScope.LECTURE, PostScope.SELECTED])
    .optional(),
  /** 검색어 */
  search: z.string().trim().optional(),
  /** 게시물 유형 필터 (공지사항, 자료공유) */
  postType: z.enum([PostType.NOTICE, PostType.SHARE]).optional(),
  /** 정렬 기준 (최신순, 오래된순) */
  orderBy: z.enum(['latest', 'oldest']).default('latest'),
});

/**
 * 강사 게시물 ID 경로 파라미터 검증 스키마
 */
export const instructorPostParamsSchema = z.object({
  /** 게시물 ID */
  postId: z.cuid2(),
});

/** 강사 게시물 작성 DTO 타입 */
export type CreateInstructorPostDto = z.infer<
  typeof createInstructorPostSchema
>;
/** 강사 게시물 수정 DTO 타입 */
export type UpdateInstructorPostDto = z.infer<
  typeof updateInstructorPostSchema
>;
/** 강사 게시물 목록 조회 쿼리 DTO 타입 */
export type GetInstructorPostsQueryDto = z.infer<
  typeof getInstructorPostsQuerySchema
>;

/**
 * 게시물 대상 조회 쿼리 파라미터 검증 스키마
 */
export const getPostTargetsQuerySchema = z.object({
  /** 강의 ID */
  lectureId: z.cuid2(),
});

/** 게시물 대상 조회 쿼리 DTO 타입 */
export type GetPostTargetsQueryDto = z.infer<typeof getPostTargetsQuerySchema>;
