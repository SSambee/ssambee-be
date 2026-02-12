import { z } from 'zod';

/** 과제 생성 스키마 */
export const createAssignmentSchema = z.object({
  title: z.string().min(1, '과제 이름은 필수입니다.'),
  categoryId: z.string().uuid('올바른 카테고리 ID 형식이 아닙니다.'),
});

/** 강의 ID 파라미터 스키마 */
export const lectureIdParamSchema = z.object({
  lectureId: z.string().min(1, '강의 ID는 필수입니다.'),
});

/** 과제 목록 조회 쿼리 스키마 */
export const getAssignmentsQuerySchema = z.object({
  lectureId: z.string().optional(),
});

/** 과제 ID 파라미터 스키마 */
export const assignmentIdParamSchema = z.object({
  assignmentId: z.string().uuid('올바른 과제 ID 형식이 아닙니다.'),
});

/** 과제 수정 스키마 */
export const updateAssignmentSchema = z
  .object({
    title: z
      .string()
      .min(1, '과제 이름은 최소 1자 이상이어야 합니다.')
      .optional(),
    categoryId: z
      .string()
      .uuid('올바른 카테고리 ID 형식이 아닙니다.')
      .optional(),
  })
  .refine((data) => data.title !== undefined || data.categoryId !== undefined, {
    message: '제목 또는 카테고리 중 하나는 반드시 포함되어야 합니다.',
  });

export type CreateAssignmentDto = z.infer<typeof createAssignmentSchema>;
export type GetAssignmentsQueryDto = z.infer<typeof getAssignmentsQuerySchema>;
export type UpdateAssignmentDto = z.infer<typeof updateAssignmentSchema>;
