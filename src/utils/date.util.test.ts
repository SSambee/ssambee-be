import {
  toKstIsoString,
  parseToUtc,
  toKstDateOnly,
  startOfDayKst,
  transformDateFieldsToKst,
} from './date.util.js';

describe('Date Utilities (KST)', () => {
  describe('toKstIsoString', () => {
    it('UTC Date 객체를 KST ISO 문자열(+09:00)로 변환해야 한다', () => {
      const date = new Date('2024-01-15T09:00:00Z');
      const result = toKstIsoString(date);
      expect(result).toBe('2024-01-15T18:00:00+09:00');
    });

    it('null이나 undefined인 경우 null을 반환해야 한다', () => {
      expect(toKstIsoString(null)).toBeNull();
      expect(toKstIsoString(undefined)).toBeNull();
    });
  });

  describe('parseToUtc', () => {
    it('타임존 정보가 없는 문자열을 KST로 간주하고 UTC로 변환해야 한다', () => {
      const dateString = '2024-01-15T18:00:00';
      const result = parseToUtc(dateString);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('명시된 타임존(KST)을 존중하여 처리해야 한다', () => {
      const dateString = '2024-01-15T18:00:00+09:00';
      const result = parseToUtc(dateString);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('명시된 타임존(UTC)을 존중하여 처리해야 한다', () => {
      const dateString = '2024-01-15T09:00:00Z';
      const result = parseToUtc(dateString);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('기타 타임존(+01:00)을 존중하여 처리해야 한다', () => {
      const dateString = '2024-01-15T10:00:00+01:00';
      const result = parseToUtc(dateString);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });
  });

  describe('toKstDateOnly', () => {
    it('KST 기준의 YYYY-MM-DD 날짜를 반환해야 한다', () => {
      const date = new Date('2024-01-15T21:00:00Z'); // KST 1월 16일 06:00
      const result = toKstDateOnly(date);
      expect(result).toBe('2024-01-16');
    });
  });

  describe('startOfDayKst', () => {
    it('주어진 날짜의 KST 기준 00:00:00에 해당하는 UTC Date를 반환해야 한다', () => {
      const date = new Date('2024-01-15T15:00:00Z'); // KST 1월 16일 00:00
      const result = startOfDayKst(date);
      expect(result.toISOString()).toBe('2024-01-15T15:00:00.000Z');
    });

    it('낮 시간대 날짜도 정상적으로 처리해야 한다', () => {
      const date = new Date('2024-01-15T09:00:00Z'); // KST 1월 15일 18:00
      const result = startOfDayKst(date);
      expect(result.toISOString()).toBe('2024-01-14T15:00:00.000Z'); // KST 1월 15일 00:00
    });

    it('날짜가 넘어가는 경우(KST 다음날)를 정상적으로 처리해야 한다', () => {
      const date = new Date('2024-01-15T21:00:00Z'); // KST 1월 16일 06:00
      const result = startOfDayKst(date);
      expect(result.toISOString()).toBe('2024-01-15T15:00:00.000Z'); // KST 1월 16일 00:00
    });
  });

  describe('transformDateFieldsToKst', () => {
    it('지정된 날짜 필드들을 KST 문자열로 변환해야 한다', () => {
      const obj = {
        id: 1,
        createdAt: new Date('2024-01-15T09:00:00Z'),
        other: 'value',
      };
      const result = transformDateFieldsToKst(obj, ['createdAt']);
      expect(result.createdAt).toBe('2024-01-15T18:00:00+09:00');
      expect(result.other).toBe('value');
    });

    it('배열 데이터를 정상적으로 처리해야 한다', () => {
      const arr = [{ date: new Date('2024-01-15T09:00:00Z') }];
      const result = transformDateFieldsToKst(arr, ['date']);
      expect(result[0].date).toBe('2024-01-15T18:00:00+09:00');
    });
  });
});
