import {
  toKstIsoString,
  parseToUtc,
  toKstDateOnly,
  transformDateFieldsToKst,
  startOfDayKst,
} from './date.util.js';

describe('Date Utilities (KST)', () => {
  describe('toKstIsoString', () => {
    it('should convert UTC date to KST ISO string (+09:00)', () => {
      // 2024-01-15 09:00:00 UTC -> 2024-01-15 18:00:00 KST
      const utcDate = new Date('2024-01-15T09:00:00.000Z');
      const result = toKstIsoString(utcDate);
      expect(result).toBe('2024-01-15T18:00:00+09:00');
    });

    it('should handle null or undefined', () => {
      expect(toKstIsoString(null)).toBeNull();
      expect(toKstIsoString(undefined)).toBeNull();
    });
  });

  describe('parseToUtc', () => {
    it('should treat timezone-less string as KST and convert to UTC', () => {
      // 2024-01-15 18:00:00 (KST) -> 2024-01-15 09:00:00 UTC
      const input = '2024-01-15T18:00:00';
      const result = parseToUtc(input);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should respect provided timezone (KST)', () => {
      // 2024-01-15 18:00:00+09:00 -> 2024-01-15 09:00:00 UTC
      const input = '2024-01-15T18:00:00+09:00';
      const result = parseToUtc(input);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should respect provided timezone (UTC)', () => {
      // 2024-01-15 09:00:00Z -> 2024-01-15 09:00:00 UTC
      const input = '2024-01-15T09:00:00Z';
      const result = parseToUtc(input);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });

    it('should respect provided timezone (Other: +01:00)', () => {
      // 2024-01-15 10:00:00+01:00 -> 2024-01-15 09:00:00 UTC
      const input = '2024-01-15T10:00:00+01:00';
      const result = parseToUtc(input);
      expect(result.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    });
  });

  describe('toKstDateOnly', () => {
    it('should return YYYY-MM-DD based on KST', () => {
      // 2024-01-15 15:00:00 UTC -> 2024-01-16 00:00:00 KST -> 2024-01-16
      const utcDate = new Date('2024-01-15T15:00:00.000Z');
      const result = toKstDateOnly(utcDate);
      expect(result).toBe('2024-01-16');
    });
  });

  describe('startOfDayKst', () => {
    it('should return UTC date corresponding to KST 00:00:00 of the given date', () => {
      // Case 1: Input is UTC 00:00 (e.g. from new Date('2024-01-01'))
      // 2024-01-01 00:00 UTC = 2024-01-01 09:00 KST
      // startOfDay in KST is 2024-01-01 00:00 KST = 2023-12-31 15:00 UTC
      const input = new Date('2024-01-01T00:00:00.000Z');
      const result = startOfDayKst(input);
      expect(result.toISOString()).toBe('2023-12-31T15:00:00.000Z');
    });

    it('should handle middle of the day correctly', () => {
      // Case 2: Input is 2024-01-01 12:00:00 UTC = 2024-01-01 21:00 KST
      // startOfDay in KST is 2024-01-01 00:00 KST = 2023-12-31 15:00 UTC
      const input = new Date('2024-01-01T12:00:00.000Z');
      const result = startOfDayKst(input);
      expect(result.toISOString()).toBe('2023-12-31T15:00:00.000Z');
    });

    it('should handle date crossing (next day in KST)', () => {
      // Case 3: Input is 2024-01-01 16:00:00 UTC = 2024-01-02 01:00 KST
      // startOfDay in KST is 2024-01-02 00:00 KST = 2024-01-01 15:00 UTC
      const input = new Date('2024-01-01T16:00:00.000Z');
      const result = startOfDayKst(input);
      expect(result.toISOString()).toBe('2024-01-01T15:00:00.000Z');
    });
  });

  describe('transformDateFieldsToKst', () => {
    it('should transform specified date fields to KST strings', () => {
      const input = {
        id: '1',
        name: 'Test',
        createdAt: new Date('2024-01-15T09:00:00.000Z'), // 18:00 KST
        updatedAt: new Date('2024-01-15T10:00:00.000Z'), // 19:00 KST
        otherDate: new Date('2024-01-15T11:00:00.000Z'), // should stay Date if not specified
      };

      const result = transformDateFieldsToKst(input, [
        'createdAt',
        'updatedAt',
      ]);

      expect(result.createdAt).toBe('2024-01-15T18:00:00+09:00');
      expect(result.updatedAt).toBe('2024-01-15T19:00:00+09:00');
      expect(result.otherDate).toBeInstanceOf(Date);
    });

    it('should handle arrays', () => {
      const input = [
        { date: new Date('2024-01-15T09:00:00.000Z') },
        { date: new Date('2024-01-15T10:00:00.000Z') },
      ];

      const result = transformDateFieldsToKst(input, ['date']);

      expect(result[0].date).toBe('2024-01-15T18:00:00+09:00');
      expect(result[1].date).toBe('2024-01-15T19:00:00+09:00');
    });
  });
});
