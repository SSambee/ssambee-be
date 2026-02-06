export const MaterialType = {
  EXAM_PAPER: 'EXAM_PAPER', // 시험지
  REFERENCE: 'REFERENCE', // 참고자료
  VIDEO_LINK: 'VIDEO_LINK', // 동영상 링크 (YouTube 등)
  INSTRUCTOR_REQUEST: 'INSTRUCTOR_REQUEST', // 강사 요청 자료 (조교에게 전달)
  ETC: 'ETC', // 기타
} as const;

export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType];
