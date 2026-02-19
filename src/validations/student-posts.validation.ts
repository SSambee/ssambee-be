import { z } from 'zod';
import {
  StudentPostStatus,
  InquiryWriterType,
} from '../constants/posts.constant.js';

/**
 * 학생 질문 게시물 작성 요청 검증 스키마
 */
export const createStudentPostSchema = z.object({
  /** 제목 */
  title: z.string().min(1, '제목은 필수입니다.'),
  /** 내용 */
  content: z.string().min(1, '내용은 필수입니다.'),
  /** 특정 강의 관련 질문인 경우 강의 ID (선택) */
  lectureId: z.cuid2().optional(),
  /** 질문 대상 자녀 연결 ID (학부모가 작성 시 필수) */
  childLinkId: z.string().optional(),
});

/**
 * 학생 질문 게시물 상태 수정 요청 검증 스키마 (강사/조교용)
 */
export const updateStudentPostStatusSchema = z.object({
  /** 변경할 상태 (대기, 답변완료, 확인완료) */
  status: z.enum([
    StudentPostStatus.BEFORE,
    StudentPostStatus.REGISTERED,
    StudentPostStatus.COMPLETED,
  ]),
});

/**
 * 학생 질문 게시물 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getStudentPostsQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(1),
  /** 페이지당 항목 수 */
  limit: z.coerce.number().min(1).max(50).default(20),
  /** 특정 강의 ID 필터 */
  lectureId: z.cuid2().optional(),
  status: z
    .enum([
      StudentPostStatus.BEFORE,
      StudentPostStatus.REGISTERED,
      StudentPostStatus.COMPLETED,
    ])
    .optional(),
  /** 작성자 유형 필터 (전체, 학생, 학부모) */
  writerType: z
    .enum([
      InquiryWriterType.ALL,
      InquiryWriterType.STUDENT,
      InquiryWriterType.PARENT,
    ])
    .optional()
    .default(InquiryWriterType.ALL),
  /** 검색어 */
  search: z.string().optional(),
  /** 정렬 기준 (최신순, 오래된순) */
  orderBy: z.enum(['latest', 'oldest']).default('latest'),
});

/**
 * 내 수강 강의 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getMyLecturesQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(1),
  /** 페이지당 항목 수 */
  limit: z.coerce.number().min(1).max(50).default(20),
});

/**
 * 학생 질문 게시물 ID 경로 파라미터 검증 스키마
 */
export const studentPostParamsSchema = z.object({
  /** 게시물 ID */
  postId: z.cuid2(),
});

/**
 * 학생 질문 게시물 수정 요청 검증 스키마
 */
export const updateStudentPostSchema = z.object({
  /** 제목 */
  title: z.string().min(1, '제목은 필수입니다.').optional(),
  /** 내용 */
  content: z.string().min(1, '내용은 필수입니다.').optional(),
});

/** 학생 질문 작성 DTO 타입 */
export type CreateStudentPostDto = z.infer<typeof createStudentPostSchema>;
/** 학생 질문 상태 수정 DTO 타입 */
export type UpdateStudentPostStatusDto = z.infer<
  typeof updateStudentPostStatusSchema
>;
/** 학생 질문 목록 조회 쿼리 DTO 타입 */
export type GetStudentPostsQueryDto = z.infer<
  typeof getStudentPostsQuerySchema
>;
/** 학생 질문 수정 DTO 타입 */
export type UpdateStudentPostDto = z.infer<typeof updateStudentPostSchema>;
/** 내 수강 강의 목록 조회 쿼리 DTO 타입 */
export type GetMyLecturesQueryDto = z.infer<typeof getMyLecturesQuerySchema>;
