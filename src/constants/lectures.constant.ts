export const LectureLimits = {
  TITLE_MAX_LENGTH: 255,
  SUBJECT_MAX_LENGTH: 100,
  DESCRIPTION_MAX_LENGTH: 5000,
} as const;

export const LectureStatus = {
  SCHEDULED: 'SCHEDULED', // 개강전
  IN_PROGRESS: 'IN_PROGRESS', // 개강
  COMPLETED: 'COMPLETED', // 종강
} as const;
export type LectureStatus = (typeof LectureStatus)[keyof typeof LectureStatus];
