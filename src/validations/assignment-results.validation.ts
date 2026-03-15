import { z } from 'zod';

/**
 * 과제 결과 생성 요청 검증 스키마
 */
export const createAssignmentResultSchema = z.object({
  /** 강의 수강 ID */
  lectureEnrollmentId: z.string().min(1, '수강생 ID는 필수입니다.'),
  /** 선택한 결과 인덱스 (resultPresets 내의 인덱스) */
  resultIndex: z.number().int().min(0, 'resultIndex는 0 이상이어야 합니다.'),
});

/**
 * 과제 결과 수정 요청 검증 스키마
 */
export const updateAssignmentResultSchema = z.object({
  /** 선택한 결과 인덱스 */
  resultIndex: z.number().int().min(0, 'resultIndex는 0 이상이어야 합니다.'),
});

/** 과제 결과 단체 일괄 처리 요청 스키마 */
const bulkItemSchema = z.object({
  /** 과제 ID (CUID2) */
  assignmentId: z.string().cuid2('올바른 과제 ID (CUID2) 형식이 아닙니다.'),
  /** 강의 수강 ID (CUID2) */
  lectureEnrollmentId: z
    .string()
    .cuid2('올바른 수강생 ID (CUID2) 형식이 아닙니다.'),
  /** 결과 인덱스 (숫자면 UPSERT, null이면 삭제) */
  resultIndex: z
    .number()
    .int('resultIndex는 정수여야 합니다.')
    .min(0, 'resultIndex는 0 이상이어야 합니다.')
    .nullable(),
});

/** 과제 결과 단체 처리 옵션 */
export const bulkAssignmentResultsOptionsSchema = z.object({
  /** true이면 하나라도 실패 시 전체 롤백 */
  strict: z.boolean().default(true),
});

/** 과제 결과 단체 등록/수정/삭제 요청 스키마 */
export const upsertAssignmentResultsSchema = z
  .object({
    options: bulkAssignmentResultsOptionsSchema.default({ strict: true }),
    items: z
      .array(bulkItemSchema)
      .min(1, '최소 1개 이상의 과제 결과 항목이 필요합니다.'),
  })
  .superRefine((data, ctx) => {
    const pairSet = new Set<string>();
    data.items.forEach((item, index) => {
      const key = `${item.assignmentId}__${item.lectureEnrollmentId}`;
      if (pairSet.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index],
          message: '동일한 과제/학생 조합이 중복 입력되었습니다.',
        });
      }
      pairSet.add(key);
    });
  });

/**
 * 과제 ID 경로 파라미터 검증 스키마
 */
export const assignmentIdParamSchema = z.object({
  /** 과제 ID (CUID2) */
  assignmentId: z.string().cuid2('올바른 과제 ID (CUID2) 형식이 아닙니다.'),
});

/**
 * 과제 결과 ID 경로 파라미터 검증 스키마
 */
export const assignmentResultIdParamSchema = z.object({
  /** 과제 결과 ID (CUID2) */
  resultId: z.string().cuid2('올바른 과제 결과 ID (CUID2) 형식이 아닙니다.'),
});

/** 과제 결과 생성 DTO 타입 */
export type CreateAssignmentResultDto = z.infer<
  typeof createAssignmentResultSchema
>;
/** 과제 결과 수정 DTO 타입 */
export type UpdateAssignmentResultDto = z.infer<
  typeof updateAssignmentResultSchema
>;

/** 과제 결과 단체 처리 요청 DTO */
export type UpsertAssignmentResultsDto = z.infer<
  typeof upsertAssignmentResultsSchema
>;
