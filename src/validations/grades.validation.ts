import { z } from 'zod';

/**
 * 학생 개별 문항 답안 검증 스키마
 */
export const studentAnswerSchema = z
  .object({
    /** 문항 ID (선택) */
    questionId: z.string().optional(),
    /** 문항 번호 (선택, 우선순위 높음) */
    questionNumber: z.number().int().optional(),
    /** 제출한 답안 */
    submittedAnswer: z.string(),
    /** 정답 여부 */
    isCorrect: z.boolean(),
  })
  .refine((data) => data.questionId || data.questionNumber !== undefined, {
    message: 'questionId 또는 questionNumber 중 하나는 필수입니다.',
    path: ['questionNumber'],
  });

/**
 * 시험 채점 결과 제출 요청 검증 스키마
 */
export const submitGradingSchema = z.object({
  /** 강의 수강 ID */
  lectureEnrollmentId: z.string().min(1, '수강 ID는 필수입니다.'),
  /** 학생 답안 목록 */
  answers: z.array(studentAnswerSchema).min(1, '최소 1개의 답안이 필요합니다.'),
  /** 총점 */
  totalScore: z.number().int().min(0),
  /** 정답 문항 수 */
  correctCount: z.number().int().min(0),
});

/** 채점 결과 제출 DTO 타입 */
export type SubmitGradingDto = z.infer<typeof submitGradingSchema>;

/**
 * 강의 수강 ID 경로 파라미터 검증 스키마
 */
export const lectureEnrollmentIdParamSchema = z.object({
  /** 강의 수강 ID */
  lectureEnrollmentId: z.string().min(1, '수강 ID는 필수입니다.'),
});

/** 수강 ID 파라미터 DTO 타입 */
export type LectureEnrollmentIdParamDto = z.infer<
  typeof lectureEnrollmentIdParamSchema
>;

/**
 * 성적 ID 경로 파라미터 검증 스키마
 */
export const gradeIdParamSchema = z.object({
  /** 성적 ID */
  gradeId: z.string().min(1, '성적 ID는 필수입니다.'),
});

/** 성적 ID 파라미터 DTO 타입 */
export type GradeIdParamDto = z.infer<typeof gradeIdParamSchema>;

/**
 * 성적표 설명 업데이트 요청 검증 스키마
 */
export const gradeReportDescriptionSchema = z.object({
  /** 성적표 설명/코멘트 */
  description: z.string(),
});

/** 성적표 설명 업데이트 DTO 타입 */
export type GradeReportDescriptionDto = z.infer<
  typeof gradeReportDescriptionSchema
>;
