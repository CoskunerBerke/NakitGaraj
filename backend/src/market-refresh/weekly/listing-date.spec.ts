import { parseListingDate } from './listing-date';

describe('weekly source listing dates', () => {
  test('uses the Europe/Istanbul calendar day for Bugün and Dün', () => {
    const afterMidnightInTurkey = new Date('2026-09-03T21:30:00.000Z');
    expect(parseListingDate('Bugün 00:15', afterMidnightInTurkey)).toBe(
      '2026-09-04',
    );
    expect(parseListingDate('Dün', afterMidnightInTurkey)).toBe('2026-09-03');
  });

  test('rejects impossible and unknown dates without capture-time fallback', () => {
    expect(parseListingDate('31 Şubat 2026')).toBeNull();
    expect(parseListingDate('yakın zamanda')).toBeNull();
  });
});
