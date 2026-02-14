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
