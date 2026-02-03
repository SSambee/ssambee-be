import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export type PaginationQueryDto = z.infer<typeof paginationQuerySchema>;

import { parseToUtc, startOfDayKst } from '../utils/date.util.js';

/**
 * ISO 8601 DateTime 문자열을 처리하는 공용 스키마
 * - 타임존이 없는 경우: KST(+09:00)로 간주하여 UTC로 변환
 * - 타임존이 있는 경우: 해당 타임존을 반영하여 UTC로 변환
 */
export const dateTimeSchema = z
  .string()
  .datetime({ offset: true }) // ISO 8601 포맷 + 오프셋 허용
  .or(z.string().datetime()) // 오프셋 없는 경우 허용
  .transform((val) => parseToUtc(val));

/**
 * 날짜(Date) 객체 또는 문자열을 처리하는 공용 스키마 (시간 제외, 날짜 기준)
 * - 입력받은 날짜의 KST 기준 00:00:00에 해당하는 UTC Date로 변환
 */
export const dateSchema = z.coerce
  .date()
  .transform((val) => startOfDayKst(val));
