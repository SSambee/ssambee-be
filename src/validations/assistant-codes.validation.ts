import { z } from 'zod';

/** 조교 가입 코드 생성 */
export const createAssistantCodeSchema = z.object({});

/** 조교 가입 코드 목록 조회 (페이지네이션 등 필요 시 추가) */
// 현재는 특별한 쿼리 파라미터가 없으므로 빈 객체 처리 혹은 생략 가능
// export const getAssistantCodesSchema = z.object({});

/** 조교 가입 코드 검증 */
export const validateAssistantCodeSchema = z.object({
  code: z.string().length(6, '코드는 6자리여야 합니다.'),
});

export type ValidateAssistantCodeDto = z.infer<
  typeof validateAssistantCodeSchema
>;
