export const QuestionType = {
  MULTIPLE: 'MULTIPLE',
  ESSAY: 'ESSAY',
} as const;

export type QuestionType = (typeof QuestionType)[keyof typeof QuestionType];

export const GradingStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
} as const;

export type GradingStatus = (typeof GradingStatus)[keyof typeof GradingStatus];
