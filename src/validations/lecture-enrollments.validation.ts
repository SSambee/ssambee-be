import { z } from 'zod';

/**
 * 강의 수강 ID 경로 파라미터 검증 스키마
 */
export const lectureEnrollmentIdParamSchema = z.object({
  /** 강의 수강 ID (CUID2 형식) */
  lectureEnrollmentId: z.string().cuid2(),
});

/** 강의 수강 ID 파라미터 타입 */
export type LectureEnrollmentIdParam = z.infer<
  typeof lectureEnrollmentIdParamSchema
>;
