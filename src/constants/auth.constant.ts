export const UserType = {
  ADMIN: 'ADMIN',
  INSTRUCTOR: 'INSTRUCTOR',
  ASSISTANT: 'ASSISTANT',
  STUDENT: 'STUDENT',
  PARENT: 'PARENT',
} as const;

// 이메일 OTP 인증 이후, 프로필 생성이 완료되기 전 임시 상태
export const SIGNUP_PENDING_USER_TYPE = 'SIGNUP_PENDING' as const;

export type UserType = (typeof UserType)[keyof typeof UserType];

export const AdminProfileStatus = {
  PENDING_ACTIVATION: 'PENDING_ACTIVATION',
  ACTIVE: 'ACTIVE',
} as const;

export type AdminProfileStatus =
  (typeof AdminProfileStatus)[keyof typeof AdminProfileStatus];

// 각 userType에 해당하는 Prisma 모델 매핑
export const UserTypeToModel = {
  INSTRUCTOR: 'instructor',
  ASSISTANT: 'assistant',
  STUDENT: 'appStudent',
  PARENT: 'appParent',
} as const;

// 인증 쿠키 이름
export const AUTH_COOKIE_NAME = 'ssambee-auth.session_token';
export const AUTH_COOKIE_NAMES = [
  AUTH_COOKIE_NAME,
  `__Secure-${AUTH_COOKIE_NAME}`,
] as const;

export const AssistantStatus = {
  PENDING: 'PENDING',
  SIGNED: 'SIGNED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type AssistantStatus =
  (typeof AssistantStatus)[keyof typeof AssistantStatus];

export const AssistantAttendanceStatus = {
  PENDING: 'PENDING',
  ATTENDED: 'ATTENDED',
  ABSENT: 'ABSENT',
  VACATION: 'VACATION',
} as const;

export type AssistantAttendanceStatus =
  (typeof AssistantAttendanceStatus)[keyof typeof AssistantAttendanceStatus];
