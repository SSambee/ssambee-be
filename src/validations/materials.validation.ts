import { z } from 'zod';
import { FrontendMaterialType } from '../constants/materials.constant.js';

/**
 * 학습 자료 업로드 요청 검증 스키마
 */
export const uploadMaterialSchema = z.object({
  /** 제목 */
  title: z.string().min(1, '제목은 필수 입력 사항입니다.'),
  /** 상세 설명 (선택) */
  description: z.string().optional(),
  /** 과목 (선택) */
  subject: z.string().optional(),
  /** 외부 다운로드 URL (선택) */
  externalDownloadUrl: z.url('유효하지 않은 URL입니다.').optional(),
  /** 자료 유형 (학습지, 영상, 요청사항, 기타) */
  type: z.enum([
    FrontendMaterialType.PAPER,
    FrontendMaterialType.VIDEO,
    FrontendMaterialType.REQUEST,
    FrontendMaterialType.OTHER,
  ]),
  /** YouTube URL (유형이 영상인 경우 선택적 사용) */
  youtubeUrl: z.url('유효하지 않은 YouTube URL입니다.').optional(),
});

/**
 * 학습 자료 수정 요청 검증 스키마
 */
export const updateMaterialSchema = z.object({
  /** 제목 */
  title: z.string().min(1).optional(),
  /** 상세 설명 */
  description: z.string().optional(),
  /** 과목 */
  subject: z.string().optional(),
  /** 외부 다운로드 URL */
  externalDownloadUrl: z.url('유효하지 않은 URL입니다.').optional(),
  /** YouTube URL */
  youtubeUrl: z.url('유효하지 않은 YouTube URL입니다.').optional(),
});

/**
 * 학습 자료 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getMaterialsQuerySchema = z.object({
  /** 페이지 번호 */
  page: z.coerce.number().min(1).default(1),
  /** 페이지당 항목 수 */
  limit: z.coerce.number().min(1).max(50).default(20),
  /** 자료 유형 필터 */
  type: z
    .enum([
      FrontendMaterialType.PAPER,
      FrontendMaterialType.VIDEO,
      FrontendMaterialType.REQUEST,
      FrontendMaterialType.OTHER,
    ])
    .optional(),
  /** 검색어 */
  search: z.string().optional(),
  /** 정렬 순서 (최신순, 과거순) */
  sort: z.enum(['latest', 'oldest']).optional(),
});

/**
 * 학습 자료 ID 경로 파라미터 검증 스키마
 */
export const materialParamsSchema = z.object({
  /** 자료 ID (CUID2) */
  materialsId: z.cuid2(),
});

/**
 * 강의 ID 경로 파라미터 검증 스키마
 */
export const lectureMaterialParamsSchema = z.object({
  /** 강의 ID (CUID2) */
  lectureId: z.cuid2(),
});

/** 학습 자료 업로드 DTO 타입 */
export type UploadMaterialDto = z.infer<typeof uploadMaterialSchema>;
/** 학습 자료 수정 DTO 타입 */
export type UpdateMaterialDto = z.infer<typeof updateMaterialSchema>;
/** 학습 자료 목록 조회 쿼리 DTO 타입 */
export type GetMaterialsQueryDto = z.infer<typeof getMaterialsQuerySchema>;
