import {
  HttpException,
  UnauthorizedException,
  ConflictException,
} from './http.exception.js';

interface BetterAuthError {
  code?: string;
  body?: {
    code?: string;
    message?: string;
  };
  message?: string;
  status?: string | number;
  [key: string]: unknown;
}

export function isBetterAuthError(error: unknown): error is BetterAuthError {
  if (typeof error !== 'object' || error === null) return false;

  const e = error as Record<string, unknown>;

  // 탑 레벨에 code가 있거나
  if ('code' in e && typeof e.code === 'string') return true;

  // body 안에 code가 있거나 (InternalAPIError 구조)
  if (
    'body' in e &&
    typeof e.body === 'object' &&
    e.body !== null &&
    'code' in (e.body as Record<string, unknown>) &&
    typeof (e.body as Record<string, unknown>).code === 'string'
  ) {
    return true;
  }

  return false;
}

export function mapBetterAuthErrorToHttpException(
  error: BetterAuthError,
): HttpException | null {
  const code = error.body?.code || error.code;
  // 1. 특정 에러 코드 매핑
  if (code) {
    switch (code) {
      case 'USER_ALREADY_EXISTS':
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        return new ConflictException('이미 사용 중인 이메일입니다.');
      case 'INVALID_EMAIL_OR_PASSWORD':
        return new UnauthorizedException(
          '이메일 또는 비밀번호가 올바르지 않습니다.',
        );
      // 필요한 경우 추가
    }
  }

  return null;
}
