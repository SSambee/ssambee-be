import { z } from 'zod';

/**
 * 과제 생성 요청 검증 스키마
 */
export const createAssignmentSchema = z.object({
  /** 과제 제목 */
  title: z.string().min(1, '과제 이름은 필수입니다.'),
  /** 과제 결과 레이블 배열 */
  resultPresets: z
    .array(z.string().min(1, '결과 패턴은 빈 문자열일 수 없습니다.'))
    .min(1, '최소 1개 이상의 결과 패턴이 필요합니다.')
    .refine((items) => new Set(items).size === items.length, {
      message: '결과 패턴에 중복된 값이 있습니다.',
    }),
});

/**
 * 강의 ID 경로 파라미터 검증 스키마
 */
export const lectureIdParamSchema = z.object({
  /** 강의 ID */
  lectureId: z.string().min(1, '강의 ID는 필수입니다.'),
});

/**
 * 과제 목록 조회 쿼리 파라미터 검증 스키마
 */
export const getAssignmentsQuerySchema = z.object({
  /** 특정 강의 ID 필터 */
  lectureId: z.string().optional(),
});

/**
 * 과제 ID 경로 파라미터 검증 스키마
 */
export const assignmentIdParamSchema = z.object({
  /** 과제 ID */
  assignmentId: z.string().cuid2('올바른 과제 ID 형식이 아닙니다.'),
});

/**
 * 과제 수정 요청 검증 스키마
 */
export const updateAssignmentSchema = z
  .object({
    /** 과제 제목 */
    title: z
      .string()
      .min(1, '과제 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
    /** 과제 결과 레이블 배열 */
    resultPresets: z
      .array(z.string().min(1, '결과 패턴은 빈 문자열일 수 없습니다.'))
      .min(1, '최소 1개 이상의 결과 패턴이 필요합니다.')
      .refine((items) => new Set(items).size === items.length, {
        message: '결과 패턴에 중복된 값이 있습니다.',
      })
      .optional(),
  })
  .refine(
    (data) => data.title !== undefined || data.resultPresets !== undefined,
    {
      message: '제목 또는 결과 패턴 중 하나는 반드시 포함되어야 합니다.',
    },
  );

/** 과제 생성 DTO 타입 */
export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
/** 과제 목록 조회 쿼리 DTO 타입 */
export type GetAssignmentsQueryDto = z.infer<typeof getAssignmentsQuerySchema>;
/** 과제 수정 DTO 타입 */
export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;
