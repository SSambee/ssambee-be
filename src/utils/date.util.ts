import { toZonedTime, format, fromZonedTime } from 'date-fns-tz';
export { toZonedTime, format, fromZonedTime };
import { parseISO, isValid, startOfDay } from 'date-fns';

export const KST_TIMEZONE = 'Asia/Seoul';

/**
 * UTC Date 객체를 KST 기준의 ISO 8601 문자열로 변환합니다.
 * 예: 2024-01-15T09:00:00Z -> 2024-01-15T18:00:00+09:00
 *
 * @param date 변환할 날짜 객체 (기본적으로 UTC로 취급됨)
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
 * @param dateString ISO 8601 날짜 문자열
 * @returns UTC Date 객체
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
 * @param date
 * @returns
 */
export function toKstDateOnly(date: Date | null | undefined): string | null {
  if (!date || !isValid(date)) return null;

  const kstDate = toZonedTime(date, KST_TIMEZONE);
  return format(kstDate, 'yyyy-MM-dd', { timeZone: KST_TIMEZONE });
}

/**
 * 주어진 날짜의 KST 기준 00:00:00에 해당하는 UTC Date를 반환합니다.
 * @param date
 * @returns KST 00:00:00에 해당하는 UTC Date
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
 * @param obj 원본 객체 또는 객체 배열
 * @param dateFields 변환할 필드명 배열
 * @returns 변환된 객체 (Date 타입 필드가 string으로 변경됨)
 */
export function transformDateFieldsToKst<T>(
  obj: T | T[],
  dateFields: (keyof T)[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  if (!obj) return obj;

  // 배열인 경우 재귀 처리
  if (Array.isArray(obj)) {
    return obj.map((item) => transformDateFieldsToKst(item, dateFields));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = { ...obj } as any;

  for (const field of dateFields) {
    if (result[field] instanceof Date) {
      result[field] = toKstIsoString(result[field] as Date);
    }
  }

  return result;
}
