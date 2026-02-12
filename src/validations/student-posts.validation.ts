import { z } from 'zod';
import {
  StudentPostStatus,
  AnswerStatus,
  InquiryWriterType,
} from '../constants/posts.constant.js';

export const createStudentPostSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.'),
  content: z.string().min(1, '내용은 필수입니다.'),
  lectureId: z.cuid2().optional(), // 특정 강의에 대한 질문일 때
  // enrollmentId는 인증 정보에서 추출하거나 별도로 처리
});

export const updateStudentPostStatusSchema = z.object({
  status: z.enum([
    StudentPostStatus.PENDING,
    StudentPostStatus.RESOLVED,
    StudentPostStatus.COMPLETED,
  ]),
});

export const getStudentPostsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  lectureId: z.cuid2().optional(),
  status: z
    .enum([
      StudentPostStatus.PENDING,
      StudentPostStatus.RESOLVED,
      StudentPostStatus.COMPLETED,
    ])
    .optional(),
  answerStatus: z
    .enum([
      AnswerStatus.BEFORE,
      AnswerStatus.REGISTERED,
      AnswerStatus.COMPLETED,
    ])
    .optional(),
  writerType: z
    .enum([
      InquiryWriterType.ALL,
      InquiryWriterType.STUDENT,
      InquiryWriterType.PARENT,
    ])
    .optional()
    .default(InquiryWriterType.ALL),
  search: z.string().optional(),
});

export const studentPostParamsSchema = z.object({
  postId: z.cuid2(),
});

export const updateStudentPostSchema = z.object({
  title: z.string().min(1, '제목은 필수입니다.').optional(),
  content: z.string().min(1, '내용은 필수입니다.').optional(),
});

export type CreateStudentPostDto = z.infer<typeof createStudentPostSchema>;
export type UpdateStudentPostStatusDto = z.infer<
  typeof updateStudentPostStatusSchema
>;
export type GetStudentPostsQueryDto = z.infer<
  typeof getStudentPostsQuerySchema
>;
export type UpdateStudentPostDto = z.infer<typeof updateStudentPostSchema>;
