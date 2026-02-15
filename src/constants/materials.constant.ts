export const MaterialType = {
  PAPER: 'PAPER', // 시험지
  VIDEO: 'VIDEO', // 동영상 링크 (YouTube 등)
  REQUEST: 'REQUEST', // 강사 요청 자료 (조교에게 전달)
  OTHER: 'OTHER', // 기타 (참고자료 등)
} as const;

export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType];
