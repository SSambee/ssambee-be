/**
 * 간단한 HTML 탈출(Escape) 함수
 * @param str - 필터링할 문자열
 * @returns 탈출된 문자열
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Zod 스키마에서 문자열 필드를 안전하게 필터링하기 위한 헬퍼
 */
export const sanitizeString = (val: string) => escapeHtml(val.trim());
