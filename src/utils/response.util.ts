import { Response } from 'express';

/**
 * 성공 응답을 보내는 유틸리티 함수
 *
 * @param res - Express Response 객체
 * @param options - 응답 옵션 (data, message, statusCode)
 * @returns Express Response 객체
 */
export const successResponse = (
  res: Response,
  {
    data,
    message,
    statusCode = 200,
  }: {
    /** 반환할 데이터 */
    data?: unknown;
    /** 성공 메시지 */
    message?: string;
    /** HTTP 상태 코드 (기본값: 200) */
    statusCode?: number;
  },
) => {
  return res.status(statusCode).json({
    status: 'success',
    data,
    message,
  });
};
