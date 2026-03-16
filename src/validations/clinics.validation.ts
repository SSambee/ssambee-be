import { z } from 'zod';

/**
 * 클리닉 일괄 생성 요청 검증 스키마
 */
export const createClinicsSchema = z.object({
  /** 클리닉 제목 (선택) */
  title: z.string().optional(),
  /** 기한 (ISO 8601 형식, 선택) */
  deadline: z.string().datetime().optional(),
  /** 메모 (선택) */
  memo: z.string().optional(),
});

/** 클리닉 일괄 생성 DTO 타입 */
export type CreateClinicsDto = z.infer<typeof createClinicsSchema>;

/**
 * 클리닉 조회 쿼리 파라미터 검증 스키마
 */
export const getClinicsQuerySchema = z.object({
  /** 특정 강의 ID 필터 */
  lectureId: z.string().optional(),
  /** 특정 시험 ID 필터 */
  examId: z.string().optional(),
});

/** 클리닉 조회 쿼리 DTO 타입 */
export type GetClinicsQueryDto = z.infer<typeof getClinicsQuerySchema>;

/**
 * 클리닉 다중 수정 요청 검증 스키마
 */
export const updateClinicsSchema = z.object({
  /** 수정할 클리닉 ID 목록 */
  clinicIds: z
    .array(z.string())
    .min(1, '최소 1개 이상의 클리닉 ID가 필요합니다.'),
  /** 수정 내용 */
  updates: z
    .object({
      /** 클리닉 상태 (PENDING, SENT, COMPLETED) */
      status: z.enum(['PENDING', 'SENT', 'COMPLETED']).optional(),
      /** 기한 (ISO 8601 형식) */
      deadline: z.string().datetime().nullable().optional(),
      /** 메모 */
      memo: z.string().nullable().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: '최소 1개 이상의 수정 필드가 필요합니다.',
    }),
});

/** 클리닉 다중 수정 DTO 타입 */
export type UpdateClinicsDto = z.infer<typeof updateClinicsSchema>;
