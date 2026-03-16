export const SCHOOL_YEARS = ['중1', '중2', '중3', '고1', '고2', '고3'] as const;
export type SchoolYear = (typeof SCHOOL_YEARS)[number];

export const EnrollmentStatus = {
  ACTIVE: 'ACTIVE',
  DROPPED: 'DROPPED',
  PAUSED: 'PAUSED',
} as const;
export type EnrollmentStatus =
  (typeof EnrollmentStatus)[keyof typeof EnrollmentStatus];
