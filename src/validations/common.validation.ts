import { z } from 'zod';
import { parseToUtc, startOfDayKst } from '../utils/date.util.js';

/**
 * 페이지네이션 쿼리 파라미터 검증 스키마
 */
export const paginationQuerySchema = z.object({
  /** 페이지 번호 (기본값: 1) */
  page: z.coerce.number().int().min(1).default(1),
  /** 페이지당 항목 수 (기본값: 10, 최대: 100) */
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/** 페이지네이션 쿼리 DTO 타입 */
export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;

/**
 * ISO 8601 DateTime 문자열을 처리하는 공용 스키마
 * - 타임존 정보가 없는 경우: 한국 표준시(KST, +09:00)로 간주하여 UTC로 변환
 * - 타임존 정보가 있는 경우: 해당 타임존을 반영하여 UTC로 변환
 */
export const dateTimeSchema = z
  .string()
  .datetime({ offset: true }) // ISO 8601 포맷 + 오프셋 허용
  .or(z.string().datetime()) // 오프셋 없는 경우 허용
  .transform((val) => parseToUtc(val));

/**
 * 날짜(Date) 객체 또는 문자열을 처리하는 공용 스키마 (시간 제외)
 * - 입력받은 날짜를 한국 표준시(KST) 기준 00:00:00에 해당하는 UTC Date로 변환합니다.
 */
export const dateSchema = z.coerce
  .date()
  .transform((val) => startOfDayKst(val));
