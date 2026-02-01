import { z } from 'zod';

/** 학생 답안 제출 스키마 */
export const studentAnswerSchema = z.object({
  questionId: z.string().min(1, '문항 ID는 필수입니다.'),
  submittedAnswer: z.string(), // 빈 문자열도 허용 (답안 미작성)
  isCorrect: z.boolean(),
});

/** 채점 요청 스키마 */
export const submitGradingSchema = z.object({
  enrollmentId: z.string().min(1, '수강 ID는 필수입니다.'),
  answers: z.array(studentAnswerSchema).min(1, '최소 1개의 답안이 필요합니다.'),
  totalScore: z.number().int().min(0),
  correctCount: z.number().int().min(0),
});

export type SubmitGradingDto = z.infer<typeof submitGradingSchema>;

/** 성적 조회 파라미터 스키마 */
export const enrollmentIdParamSchema = z.object({
  enrollmentId: z.string().min(1, '수강 ID는 필수입니다.'),
});

export const gradeIdParamSchema = z.object({
  gradeId: z.string().min(1, '성적 ID는 필수입니다.'),
});
