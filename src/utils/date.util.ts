import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';
export { toZonedTime, format, fromZonedTime };
import { parseISO, isValid, startOfDay } from 'date-fns';

/** 한국 표준시(KST) 타임존 정의 */
export const KST_TIMEZONE = 'Asia/Seoul';

/**
 * UTC Date 객체를 KST 기준의 ISO 8601 문자열로 변환합니다.
 * 예: 2024-01-15T09:00:00Z -> 2024-01-15T18:00:00+09:00
 *
 * @param date - 변환할 날짜 객체 (기본적으로 UTC로 취급됨)
 * @returns KST 오프셋이 적용된 ISO 문자열
 */
export function toKstIsoString(date: Date | null | undefined): string | null {
  if (!date || !isValid(date)) return null;

  // 단순히 시간만 이동시키는 것이 아니라, 타임존 정보를 포함하여 포맷팅
  const kstDate = toZonedTime(date, KST_TIMEZONE);
  return format(kstDate, "yyyy-MM-dd'T'HH:mm:ssXXX", {
    timeZone: KST_TIMEZONE,
  });
}

/**
 * 날짜 문자열을 UTC Date 객체로 변환합니다.
 * - 타임존 정보가 없는 경우: KST로 간주하여 처리 (입력값 - 9시간 = UTC)
 * - 타임존 정보가 있는 경우: 해당 타임존을 반영하여 UTC로 변환
 *
 * @param dateString - ISO 8601 형식의 날짜 문자열
 * @returns UTC Date 객체
 * @throws Error - 유효하지 않은 날짜 형식인 경우
 */
export function parseToUtc(dateString: string): Date {
  // 타임존 오프셋(+, -) 또는 Z가 포함되어 있는지 확인
  const hasTimezone = /([+-]\d{2}:?\d{2}|Z)$/.test(dateString);

  if (hasTimezone) {
    // 타임존이 명시된 경우: 표준 방식대로 파싱 (해당 타임존 -> UTC 자동 변환됨)
    const date = parseISO(dateString);
    if (!isValid(date)) throw new Error('Invalid date string');
    return date;
  } else {
    // 타임존이 없는 경우: KST로 간주 (+09:00)
    const kstString = `${dateString}+09:00`;
    const date = parseISO(kstString);
    if (!isValid(date)) throw new Error('Invalid date string');
    return date;
  }
}

/**
 * Date 객체를 KST 기준의 날짜 문자열(YYYY-MM-DD)로 변환합니다.
 *
 * @param date - 변환할 날짜 객체
 * @returns 'YYYY-MM-DD' 형식의 문자열
 */
export function toKstDateOnly(date: Date | null | undefined): string | null {
  if (!date || !isValid(date)) return null;

  const kstDate = toZonedTime(date, KST_TIMEZONE);
  return format(kstDate, 'yyyy-MM-dd', { timeZone: KST_TIMEZONE });
}

/**
 * 주어진 날짜의 KST 기준 00:00:00에 해당하는 UTC Date를 반환합니다.
 *
 * @param date - 기준 날짜
 * @returns KST 00:00:00에 해당하는 UTC Date 객체
 */
export function startOfDayKst(date: Date): Date {
  const kstDate = toZonedTime(date, KST_TIMEZONE);
  const kstStart = startOfDay(kstDate);
  return fromZonedTime(kstStart, KST_TIMEZONE);
}

/**
 * 객체 내의 특정 날짜 필드들을 KST ISO 문자열로 변환합니다.
 * (Prisma 모델 객체를 API 응답용으로 변환할 때 유용)
 *
 * @param obj - 원본 객체 또는 객체 배열
 * @param dateFields - 변환할 필드명 배열
 * @returns 변환된 객체 (Date 타입 필드가 string으로 변경됨)
 */
export function transformDateFieldsToKst<T extends Record<string, unknown>>(
  obj: T,
  dateFields: (keyof T)[],
): { [K in keyof T]: T[K] extends Date ? string : T[K] };
export function transformDateFieldsToKst<T extends Record<string, unknown>>(
  obj: T[],
  dateFields: (keyof T)[],
): { [K in keyof T]: T[K] extends Date ? string : T[K] }[];
export function transformDateFieldsToKst<T extends Record<string, unknown>>(
  obj: T | T[] | null | undefined,
  dateFields: (keyof T)[],
): unknown {
  if (!obj) return obj;

  // 배열인 경우 재귀 처리
  if (Array.isArray(obj)) {
    return obj.map((item) => transformDateFieldsToKst(item, dateFields));
  }

  const result = { ...obj };

  for (const field of dateFields) {
    const value = result[field];
    if (value instanceof Date) {
      (result as Record<string, unknown>)[field as string] =
        toKstIsoString(value);
    }
  }

  return result;
}
