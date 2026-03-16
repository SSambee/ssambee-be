import { z } from 'zod';
import { QuestionType } from '../constants/exams.constant.js';

/** 문항 선지 스키마 - JSONB 형태로 '번호: 내용' 저장 */
const choicesSchema = z.record(z.string(), z.string()).optional();

/**
 * 문항 생성/수정 개별 항목 검증 스키마
 */
export const questionUpsertSchema = z.object({
  /** 문항 번호 */
  questionNumber: z.number().int().positive(),
  /** 문항 내용 */
  content: z.string().min(1, '문항 내용은 필수입니다.'),
  /** 문항 유형 (객관식, 주관식 등) */
  type: z.nativeEnum(QuestionType).optional().default(QuestionType.MULTIPLE),
  /** 배점 */
  score: z.number().int().min(0).default(0),
  /** 선지 정보 (객관식인 경우) */
  choices: choicesSchema,
  /** 출처 */
  source: z.string().optional(),
  /** 카테고리/영역 */
  category: z.string().optional(),
  /** 정답 */
  correctAnswer: z.string().min(1, '정답은 필수입니다.'),
});

/** 문항 데이터 DTO 타입 */
export type QuestionUpsertDto = z.infer<typeof questionUpsertSchema>;

/**
 * 시험 생성 요청 검증 스키마
 */
export const createExamSchema = z.object({
  /** 시험 제목 */
  title: z.string().min(1, '시험 제목은 필수입니다.').max(100),
  /** 시험 설명 */
  description: z.string().optional(),
  /** 과목 */
  subject: z.string().optional(),
  /** 커트라인 점수 */
  cutoffScore: z.number().int().min(0).default(0),
  /** 출처 */
  source: z.string().optional(),
  /** 시험 일자 */
  examDate: z.string().optional(),
  /** 시험 카테고리 */
  category: z.string().optional(),
  /** 자동 클리닉 생성 여부 */
  isAutoClinic: z.boolean().default(true),
  /** 문항 목록 */
  questions: z
    .array(questionUpsertSchema)
    .min(1, '최소 1개의 문항이 필요합니다.')
    .superRefine((questions, ctx) => {
      const questionNumbers = questions.map((q) => q.questionNumber);
      const duplicates = questionNumbers.filter(
        (num, index) => questionNumbers.indexOf(num) !== index,
      );

      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `문항 번호는 중복될 수 없습니다: ${[...new Set(duplicates)].join(', ')}`,
          path: [],
        });
      }
    }),
});

/** 시험 생성 DTO 타입 */
export type CreateExamDto = z.infer<typeof createExamSchema>;

/**
 * 시험 수정 요청 검증 스키마
 */
export const updateExamSchema = z.object({
  /** 시험 제목 */
  title: z.string().min(1).max(100).optional(),
  /** 시험 설명 */
  description: z.string().optional(),
  /** 과목 */
  subject: z.string().optional(),
  /** 커트라인 점수 */
  cutoffScore: z.number().int().min(0).optional(),
  /** 출처 */
  source: z.string().optional().nullable(),
  /** 시험 일자 */
  examDate: z.string().optional().nullable(),
  /** 시험 카테고리 */
  category: z.string().optional().nullable(),
  /** 자동 클리닉 생성 여부 */
  isAutoClinic: z.boolean().optional(),
  /** 문항 목록 */
  questions: z
    .array(questionUpsertSchema)
    .optional()
    .superRefine((questions, ctx) => {
      if (!questions) return;

      const questionNumbers = questions.map((q) => q.questionNumber);
      const duplicates = questionNumbers.filter(
        (num, index) => questionNumbers.indexOf(num) !== index,
      );

      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `문항 번호는 중복될 수 없습니다: ${[...new Set(duplicates)].join(', ')}`,
          path: [],
        });
      }
    }),
});

/** 시험 수정 DTO 타입 */
export type UpdateExamDto = z.infer<typeof updateExamSchema>;

/** 시험 ID 경로 파라미터 검증 스키마 */
export const examIdParamSchema = z.object({
  /** 시험 ID */
  examId: z.string().min(1),
});

/** 강의 ID 경로 파라미터 검증 스키마 */
export const lectureIdExamParamSchema = z.object({
  /** 강의 ID */
  lectureId: z.string().min(1),
});

/** 시험 및 수강 ID 경로 파라미터 검증 스키마 */
export const examAndEnrollmentParamSchema = z.object({
  /** 시험 ID */
  examId: z.string().min(1),
  /** 강의 수강 ID */
  lectureEnrollmentId: z.string().min(1),
});

/** 시험 성적표 과제 목록 업데이트 스키마 */
export const updateExamReportAssignmentsSchema = z.object({
  /** 성적표에 표시할 과제 목록 (ID 배열, 최대 4개) */
  assignments: z
    .array(z.string().cuid2())
    .max(4, '성적표에 표시할 과제는 최대 4개까지 가능합니다.'),
});

export type UpdateExamReportAssignmentsDto = z.infer<
  typeof updateExamReportAssignmentsSchema
>;
