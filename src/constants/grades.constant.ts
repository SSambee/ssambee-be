export const GradeStatus = {
  PASS: 'PASS',
  FAIL: 'FAIL',
} as const;

export type GradeStatus = (typeof GradeStatus)[keyof typeof GradeStatus];
