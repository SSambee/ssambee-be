import { z } from 'zod';
import { MaterialType } from '../constants/materials.constant.js';

export const uploadMaterialSchema = z.object({
  title: z.string().min(1, '제목은 필수 입력 사항입니다.'),
  description: z.string().optional(),
  subject: z.string().optional(),
  externalDownloadUrl: z.url('유효하지 않은 URL입니다.').optional(),
  type: z.enum([
    MaterialType.EXAM_PAPER,
    MaterialType.REFERENCE,
    MaterialType.VIDEO_LINK,
    MaterialType.INSTRUCTOR_REQUEST,
    MaterialType.ETC,
  ]),
  // youtubeUrl은 type이 VIDEO_LINK일 때 필수 체크 (Service 레벨에서 추가 검증 가능, 여기서는 형식만)
  youtubeUrl: z.url('유효하지 않은 YouTube URL입니다.').optional(),
  lectureId: z.cuid2().optional().or(z.null()), // 라이브러리 업로드(강의 미지정) 지원
});

export const updateMaterialSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  externalDownloadUrl: z.url('유효하지 않은 URL입니다.').optional(),
  // 파일 교체는 별도 로직이 필요하거나 재업로드 유도, 여기서는 메타데이터 수정 위주
  youtubeUrl: z.url('유효하지 않은 YouTube URL입니다.').optional(),
});

export const getMaterialsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  type: z
    .enum([
      MaterialType.EXAM_PAPER,
      MaterialType.REFERENCE,
      MaterialType.VIDEO_LINK,
      MaterialType.INSTRUCTOR_REQUEST,
      MaterialType.ETC,
    ])
    .optional(),
  search: z.string().optional(),
});

export const materialParamsSchema = z.object({
  materialsId: z.cuid2(),
});

export const lectureMaterialParamsSchema = z.object({
  lectureId: z.cuid2(),
});

export type UploadMaterialDto = z.infer<typeof uploadMaterialSchema>;
export type UpdateMaterialDto = z.infer<typeof updateMaterialSchema>;
export type GetMaterialsQueryDto = z.infer<typeof getMaterialsQuerySchema>;
