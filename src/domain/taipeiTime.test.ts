import { describe, expect, it } from 'vitest';
import {
  clampDateParts,
  formatExpiryValue,
  getTaipeiToday,
  toIsoDate,
} from './taipeiTime';

describe('Taipei date utilities', () => {
  it('crosses the date boundary at UTC+8', () => {
    expect(getTaipeiToday(new Date('2026-07-14T16:00:00.000Z'))).toBe('2026-07-15');
  });

  it('clamps invalid days when year or month changes', () => {
    expect(toIsoDate(clampDateParts({ year: 2026, month: 2, day: 31 }))).toBe('2026-02-28');
    expect(toIsoDate(clampDateParts({ year: 2028, month: 2, day: 31 }))).toBe('2028-02-29');
  });

  it('only displays the precision that was entered', () => {
    expect(
      formatExpiryValue(
        { expiryDate: '2026-07-15', expiryTime: '14:00', expiryPrecision: 'hour' },
        true,
      ),
    ).toBe('2026-07-15（三） 14 時');
    expect(
      formatExpiryValue(
        { expiryDate: '2026-07-15', expiryTime: '14:25', expiryPrecision: 'minute' },
        false,
      ),
    ).toBe('2026-07-15 14:25');
  });
});
