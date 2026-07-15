import { describe, expect, it } from 'vitest';
import { daysUntil, getExpiryStatus, normalizeName } from './inventory';

const preferences = { urgentDays: 7, soonDays: 30 };

describe('normalizeName', () => {
  it('ignores whitespace, casing and full-width variants', () => {
    expect(normalizeName('  Ａ BC  ')).toBe(normalizeName('abc'));
  });
});

describe('expiry rules', () => {
  const today = new Date('2026-07-15T15:30:00.000Z');

  it('uses the Asia/Taipei calendar instead of the device calendar', () => {
    expect(daysUntil('2026-07-15', today)).toBe(0);
    expect(daysUntil('2026-07-16', today)).toBe(1);
  });

  it('follows dynamic thresholds', () => {
    expect(getExpiryStatus('2026-07-14', preferences, today)).toBe('expired');
    expect(getExpiryStatus('2026-07-22', preferences, today)).toBe('urgent');
    expect(getExpiryStatus('2026-08-14', preferences, today)).toBe('soon');
    expect(getExpiryStatus('2026-08-15', preferences, today)).toBe('safe');
  });

  it('respects the precision that was entered', () => {
    expect(getExpiryStatus('2026-07-15', preferences, today)).toBe('urgent');
    expect(
      getExpiryStatus(
        { expiryDate: '2026-07-15', expiryTime: '22:00', expiryPrecision: 'hour' },
        preferences,
        today,
      ),
    ).toBe('expired');
    expect(
      getExpiryStatus(
        { expiryDate: '2026-07-15', expiryTime: '23:45', expiryPrecision: 'minute' },
        preferences,
        today,
      ),
    ).toBe('urgent');
  });
});
