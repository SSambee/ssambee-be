import { z } from 'zod';

/** 과제 결과 생성 스키마 */
export const createAssignmentResultSchema = z.object({
  lectureEnrollmentId: z.string().min(1, '수강생 ID는 필수입니다.'),
  resultIndex: z.number().int().min(0, 'resultIndex는 0 이상이어야 합니다.'),
});

/** 과제 결과 수정 스키마 */
export const updateAssignmentResultSchema = z.object({
  resultIndex: z.number().int().min(0, 'resultIndex는 0 이상이어야 합니다.'),
});

/** 과제 ID 파라미터 스키마 */
export const assignmentIdParamSchema = z.object({
  assignmentId: z.string().uuid('올바른 과제 ID 형식이 아닙니다.'),
});

/** 과제 결과 ID 파라미터 스키마 */
export const assignmentResultIdParamSchema = z.object({
  resultId: z.string().uuid('올바른 과제 결과 ID 형식이 아닙니다.'),
});

// DTO 타입 추출
export type CreateAssignmentResultDto = z.infer<
  typeof createAssignmentResultSchema
>;
export type UpdateAssignmentResultDto = z.infer<
  typeof updateAssignmentResultSchema
>;
