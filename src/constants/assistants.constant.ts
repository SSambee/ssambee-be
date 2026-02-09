export const AssistantSignStatus = {
  PENDING: 'PENDING',
  SIGNED: 'SIGNED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
} as const;

export type AssistantSignStatus =
  (typeof AssistantSignStatus)[keyof typeof AssistantSignStatus];

// 쿼리 파라미터 매핑
export const SIGN_STATUS_MAP = {
  pending: AssistantSignStatus.PENDING,
  signed: AssistantSignStatus.SIGNED, // 기본값이지만 명시적 요청도 가능하도록
  expired: AssistantSignStatus.EXPIRED,
  rejected: AssistantSignStatus.REJECTED,
} as const;
