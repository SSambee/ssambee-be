import { z } from 'zod';

/**
 * 일정 생성 요청 검증 스키마
 */
export const createScheduleSchema = z
  .object({
    /** 일정 제목 */
    title: z.string().min(1, '일정 제목은 필수입니다.'),
    /** 상세 메모 (선택) */
    memo: z.string().optional(),
    /** 시작 일시 (ISO 8601 형식) */
    startTime: z.string().datetime({
      message:
        '시작일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T09:00:00Z)',
    }),
    /** 종료 일시 (ISO 8601 형식) */
    endTime: z.string().datetime({
      message:
        '종료일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T10:00:00Z)',
    }),
    /** 카테고리 ID (선택) */
    categoryId: z.string().cuid2().optional(),
  })
  .refine((data) => new Date(data.startTime) <= new Date(data.endTime), {
    message: '종료일시는 시작일시보다 같거나 늦어야 합니다.',
    path: ['endTime'],
  });

/**
 * 일정 수정 요청 검증 스키마
 */
export const updateScheduleSchema = z
  .object({
    /** 일정 제목 */
    title: z
      .string()
      .min(1, '일정 제목은 최소 1자 이상이어야 합니다.')
      .optional(),
    /** 상세 메모 */
    memo: z.string().optional(),
    /** 시작 일시 */
    startTime: z
      .string()
      .datetime({
        message:
          '시작일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T09:00:00Z)',
      })
      .optional(),
    /** 종료 일시 */
    endTime: z
      .string()
      .datetime({
        message:
          '종료일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T10:00:00Z)',
      })
      .optional(),
    /** 카테고리 ID */
    categoryId: z.string().cuid2().optional().nullable(),
  })
  .refine(
    (data) => {
      // 시작 일시와 종료 일시가 모두 존재할 때만 비교
      if (data.startTime && data.endTime) {
        return new Date(data.startTime) <= new Date(data.endTime);
      }
      return true;
    },
    {
      message: '종료일시는 시작일시보다 같거나 늦어야 합니다.',
      path: ['endTime'],
    },
  );

/**
 * 일정 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getSchedulesQuerySchema = z.object({
  /** 조회 시작 일시 */
  startTime: z
    .string({
      message: '조회 시작 날짜가 필요합니다.',
    })
    .datetime({
      message:
        '시작일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T09:00:00Z)',
    }),
  /** 조회 종료 일시 */
  endTime: z
    .string({
      message: '조회 종료 날짜가 필요합니다.',
    })
    .datetime({
      message:
        '종료일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T10:00:00Z)',
    }),
  /** 카테고리 필터 ('other' 또는 카테고리 ID) */
  category: z.string().optional(),
});

/**
 * 일정 ID 경로 파라미터 검증 스키마
 */
export const scheduleIdParamSchema = z.object({
  /** 일정 ID (CUID2) */
  id: z.string().cuid2('올바른 일정 ID 형식이 아닙니다.'),
});

/** 일정 생성 DTO 타입 */
export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;
/** 일정 수정 DTO 타입 */
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;
/** 일정 목록 조회 쿼리 DTO 타입 */
export type GetSchedulesQueryDto = z.infer<typeof getSchedulesQuerySchema>;
