import { z } from 'zod';

/**
 * 조교 지시사항 생성 요청 검증 스키마
 */
export const createAssistantOrderSchema = z.object({
  /** 대상 조교 ID */
  assistantId: z.string().min(1, '조교 ID는 필수입니다.'),
  /** 지시 제목 */
  title: z.string().min(1, '지시 제목은 필수입니다.'),
  /** 상세 메모 (선택) */
  memo: z.string().optional(),
  /** 우선순위 (보통, 높음, 긴급) */
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  /** 관련 자료 ID 목록 (선택) */
  materialIds: z.array(z.string()).optional(),
  /** 관련 강의 ID (선택) */
  lectureId: z.string().optional(),
  /** 마감 기한 (ISO 8601 형식, 선택) */
  deadlineAt: z.string().datetime().optional(),
});

/** 조교 지시사항 생성 DTO 타입 */
export type CreateAssistantOrderDto = z.infer<
  typeof createAssistantOrderSchema
>;

/**
 * 조교 지시사항 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getAssistantOrdersQuerySchema = z.object({
  /** 상태별 필터링 (대기, 진행중, 완료) */
  workStatus: z.enum(['PENDING', 'IN_PROGRESS', 'END']).optional(),
  /** 중요도별 필터링 (보통, 높음, 긴급) */
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  /** 제목 검색어 */
  search: z.string().max(100, '검색어는 100자 이내로 입력해주세요.').optional(),
  /** 페이지 번호 */
  page: z.coerce.number().int().min(1).default(1),
  /** 페이지당 항목 수 */
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/** 조교 지시사항 목록 조회 쿼리 DTO 타입 */
export type GetAssistantOrdersQueryDto = z.infer<
  typeof getAssistantOrdersQuerySchema
>;

/**
 * 조교 지시사항 수정 요청 검증 스키마
 */
export const updateAssistantOrderSchema = z.object({
  /** 지시 제목 */
  title: z.string().min(1, '지시 제목은 필수입니다.').optional(),
  /** 상세 메모 */
  memo: z.string().optional(),
  /** 지시 상태 */
  workStatus: z.enum(['PENDING', 'IN_PROGRESS', 'END']).optional(),
  /** 우선순위 */
  priority: z.enum(['NORMAL', 'HIGH', 'URGENT']).optional(),
  /** 관련 강의 ID */
  lectureId: z.string().optional(),
  /** 마감 기한 */
  deadlineAt: z.string().datetime().optional(),
  /** 관련 자료 ID 목록 */
  materialIds: z.array(z.string()).optional(),
});

/** 조교 지시사항 수정 DTO 타입 */
export type UpdateAssistantOrderDto = z.infer<
  typeof updateAssistantOrderSchema
>;

/**
 * 조교 지시사항 상태 변경 요청 검증 스키마
 */
export const updateAssistantOrderStatusSchema = z.object({
  /** 변경할 상태 */
  workStatus: z.enum(['PENDING', 'IN_PROGRESS', 'END']),
});

/** 조교 지시사항 상태 변경 DTO 타입 */
export type UpdateAssistantOrderStatusDto = z.infer<
  typeof updateAssistantOrderStatusSchema
>;

/**
 * 조교 지시사항 ID 경로 파라미터 검증 스키마
 */
export const assistantOrderIdParamSchema = z.object({
  /** 지시사항 ID */
  id: z.string().min(1, 'ID는 필수입니다.'),
});
