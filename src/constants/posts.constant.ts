export const PostScope = {
  GLOBAL: 'GLOBAL',
  LECTURE: 'LECTURE',
  SELECTED: 'SELECTED',
} as const;
export type PostScope = (typeof PostScope)[keyof typeof PostScope];

export const TargetRole = {
  ALL: 'ALL',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;
export type TargetRole = (typeof TargetRole)[keyof typeof TargetRole];

export const StudentPostStatus = {
  PENDING: 'PENDING',
  RESOLVED: 'RESOLVED',
  COMPLETED: 'COMPLETED',
} as const;
export type StudentPostStatus =
  (typeof StudentPostStatus)[keyof typeof StudentPostStatus];

export const AuthorRole = {
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;
export type AuthorRole = (typeof AuthorRole)[keyof typeof AuthorRole];

export const InquiryWriterType = {
  ALL: 'ALL',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;
export type InquiryWriterType =
  (typeof InquiryWriterType)[keyof typeof InquiryWriterType];

export const AnswerStatus = {
  BEFORE: 'BEFORE',
  REGISTERED: 'REGISTERED',
  COMPLETED: 'COMPLETED',
} as const;
export type AnswerStatus = (typeof AnswerStatus)[keyof typeof AnswerStatus];

export const PostType = {
  NOTICE: 'NOTICE',
  SHARE: 'SHARE',
} as const;
export type PostType = (typeof PostType)[keyof typeof PostType];
