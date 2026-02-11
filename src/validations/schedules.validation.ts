import { z } from 'zod';

/** 일정 생성 스키마 */
export const createScheduleSchema = z
  .object({
    title: z.string().min(1, '일정 제목은 필수입니다.'),
    memo: z.string().optional(),
    startTime: z.string().datetime({
      message:
        '시작일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T09:00:00Z)',
    }),
    endTime: z.string().datetime({
      message:
        '종료일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T10:00:00Z)',
    }),
    categoryId: z.string().cuid2().optional(),
  })
  .refine((data) => new Date(data.startTime) <= new Date(data.endTime), {
    message: '종료일시는 시작일시보다 같거나 늦어야 합니다.',
    path: ['endTime'],
  });

/** 일정 수정 스키마 */
export const updateScheduleSchema = z
  .object({
    title: z
      .string()
      .min(1, '일정 제목은 최소 1자 이상이어야 합니다.')
      .optional(),
    memo: z.string().optional(),
    startTime: z
      .string()
      .datetime({
        message:
          '시작일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T09:00:00Z)',
      })
      .optional(),
    endTime: z
      .string()
      .datetime({
        message:
          '종료일시는 ISO 8601 형식이어야 합니다. (예: 2024-01-01T10:00:00Z)',
      })
      .optional(),
    categoryId: z.string().cuid2().optional().nullable(),
  })
  .refine(
    (data) => {
      // startTime과 endTime이 둘 다 존재할 때만 비교 (하나만 수정할 때는 Service에서 기존 값과 비교 필요하지만, 여기서는 둘 다 들어오는 경우만 체크)
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

/** 일정 목록 조회 쿼리 스키마 */
// YYYY-MM-DD 형식 정규식
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const getSchedulesQuerySchema = z.object({
  startDate: z
    .string()
    .regex(DATE_REGEX, '날짜 형식은 YYYY-MM-DD 여야 합니다.')
    .optional(),
  endDate: z
    .string()
    .regex(DATE_REGEX, '날짜 형식은 YYYY-MM-DD 여야 합니다.')
    .optional(),
  category: z.string().optional(), // 'other' or categoryId
});

/** 일정 ID 파라미터 스키마 */
export const scheduleIdParamSchema = z.object({
  id: z.string().cuid2('올바른 일정 ID 형식이 아닙니다.'),
});

export type CreateScheduleDto = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleDto = z.infer<typeof updateScheduleSchema>;
export type GetSchedulesQueryDto = z.infer<typeof getSchedulesQuerySchema>;
