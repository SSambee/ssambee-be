export const MaterialType = {
  EXAM_PAPER: 'EXAM_PAPER', // 시험지
  REFERENCE: 'REFERENCE', // 참고자료
  VIDEO_LINK: 'VIDEO_LINK', // 동영상 링크 (YouTube 등)
  INSTRUCTOR_REQUEST: 'INSTRUCTOR_REQUEST', // 강사 요청 자료 (조교에게 전달)
  ETC: 'ETC', // 기타
} as const;

export type MaterialType = (typeof MaterialType)[keyof typeof MaterialType];

export const FrontendMaterialType = {
  PAPER: 'PAPER',
  VIDEO: 'VIDEO',
  REQUEST: 'REQUEST',
  OTHER: 'OTHER',
} as const;

export type FrontendMaterialType =
  (typeof FrontendMaterialType)[keyof typeof FrontendMaterialType];

export const toBackendMaterialType: Record<FrontendMaterialType, MaterialType> =
  {
    [FrontendMaterialType.PAPER]: MaterialType.EXAM_PAPER,
    [FrontendMaterialType.VIDEO]: MaterialType.VIDEO_LINK,
    [FrontendMaterialType.REQUEST]: MaterialType.INSTRUCTOR_REQUEST,
    [FrontendMaterialType.OTHER]: MaterialType.ETC,
  };

export const toFrontendMaterialType: Record<
  MaterialType,
  FrontendMaterialType
> = {
  [MaterialType.EXAM_PAPER]: FrontendMaterialType.PAPER,
  [MaterialType.VIDEO_LINK]: FrontendMaterialType.VIDEO,
  [MaterialType.INSTRUCTOR_REQUEST]: FrontendMaterialType.REQUEST,
  [MaterialType.ETC]: FrontendMaterialType.OTHER,
  [MaterialType.REFERENCE]: FrontendMaterialType.OTHER, // 매핑되지 않은 것은 OTHER로 처리
};
