import { z } from 'zod';
import { QuestionType } from '../constants/exams.constant.js';

/** 문항 선지 스키마 - JSONB 형태로 번호: 내용 저장 */
const choicesSchema = z.record(z.string(), z.string()).optional();

/** 문항 스키마 (생성용) */
const questionCreateSchema = z.object({
  questionNumber: z.number().int().positive(),
  content: z.string().min(1, '문항 내용은 필수입니다.'),
  type: z.nativeEnum(QuestionType).optional().default(QuestionType.MULTIPLE),
  score: z.number().int().min(0).default(0),
  choices: choicesSchema, // { "1": "내용", "2": "", ... }
  source: z.string().optional(),
  category: z.string().optional(),
  correctAnswer: z.string().min(1, '정답은 필수입니다.'),
});

export const questionUpsertSchema = questionCreateSchema;

export type QuestionUpsertDto = z.infer<typeof questionUpsertSchema>;

/** 시험 생성 스키마 */
export const createExamSchema = z.object({
  title: z.string().min(1, '시험 제목은 필수입니다.').max(100),
  description: z.string().optional(),
  subject: z.string().optional(),
  cutoffScore: z.number().int().min(0).default(0),
  source: z.string().optional(),
  examDate: z.string().optional(),
  category: z.string().optional(),
  isAutoClinic: z.boolean().default(true),
  questions: z
    .array(questionCreateSchema)
    .min(1, '최소 1개의 문항이 필요합니다.')
    .superRefine((questions, ctx) => {
      const questionNumbers = questions.map((q) => q.questionNumber);
      const duplicates = questionNumbers.filter(
        (num, index) => questionNumbers.indexOf(num) !== index,
      );

      if (duplicates.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `문번은 중복될 수 없습니다: ${[...new Set(duplicates)].join(', ')}`,
          path: [],
        });
      }
    }),
});

export type CreateExamDto = z.infer<typeof createExamSchema>;

/** 시험 수정 스키마 */
export const updateExamSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  cutoffScore: z.number().int().min(0).optional(),
  source: z.string().optional().nullable(),
  examDate: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  isAutoClinic: z.boolean().optional(),
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
          message: `문번은 중복될 수 없습니다: ${[...new Set(duplicates)].join(', ')}`,
          path: [],
        });
      }
    }),
});

export type UpdateExamDto = z.infer<typeof updateExamSchema>;

export const examIdParamSchema = z.object({
  examId: z.string().min(1),
});

export const lectureIdExamParamSchema = z.object({
  lectureId: z.string().min(1),
});

export const examAndEnrollmentParamSchema = z.object({
  examId: z.string().min(1),
  lectureEnrollmentId: z.string().min(1),
});
