import { z } from 'zod';

/**
 * 대시보드 조회 쿼리 파라미터 검증 스키마
 */
export const getDashboardQuerySchema = z.object({
  /** 자녀 링크 ID (학부모인 경우 필수) */
  childLinkId: z.string().trim().optional(),
});

/** 대시보드 조회 쿼리 DTO 타입 */
export type GetDashboardQueryDto = z.infer<typeof getDashboardQuerySchema>;
