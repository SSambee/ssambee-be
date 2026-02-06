import { z } from 'zod';

export const lectureEnrollmentIdParamSchema = z.object({
  lectureEnrollmentId: z.string().cuid2(),
});

export type LectureEnrollmentIdParam = z.infer<
  typeof lectureEnrollmentIdParamSchema
>;
