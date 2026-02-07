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
} as const;
export type StudentPostStatus =
  (typeof StudentPostStatus)[keyof typeof StudentPostStatus];

export const AuthorRole = {
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;
export type AuthorRole = (typeof AuthorRole)[keyof typeof AuthorRole];
