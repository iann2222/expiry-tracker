import type { Batch, ExpiryPrecision } from '../types';

export const TAIPEI_TIME_ZONE = 'Asia/Taipei';
export const TAIPEI_UTC_OFFSET_HOURS = 8;

const millisecondsPerMinute = 60_000;
const millisecondsPerDay = 86_400_000;
const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export function getTaipeiDateParts(now = new Date()): DateParts & { hour: number; minute: number } {
  const shifted = new Date(now.getTime() + TAIPEI_UTC_OFFSET_HOURS * 60 * millisecondsPerMinute);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

export function getTaipeiToday(now = new Date()): string {
  return toIsoDate(getTaipeiDateParts(now));
}

export function deviceUsesUtc8(now = new Date()): boolean {
  return -now.getTimezoneOffset() === TAIPEI_UTC_OFFSET_HOURS * 60;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDateParts(parts: DateParts): DateParts {
  const month = Math.min(12, Math.max(1, parts.month));
  return {
    year: parts.year,
    month,
    day: Math.min(daysInMonth(parts.year, month), Math.max(1, parts.day)),
  };
}

export function parseIsoDate(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return clampDateParts({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) });
}

export function toIsoDate(parts: DateParts): string {
  return `${parts.year.toString().padStart(4, '0')}-${parts.month.toString().padStart(2, '0')}-${parts.day.toString().padStart(2, '0')}`;
}

export function getWeekdayName(date: string): string {
  const parts = parseIsoDate(date);
  if (!parts) return '';
  return weekdayNames[new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()];
}

export function formatDate(date: string, showWeekday = true): string {
  if (!date) return '';
  return showWeekday ? `${date}（${getWeekdayName(date)}）` : date;
}

export function formatExpiryValue(
  source: Pick<Batch, 'expiryDate' | 'expiryTime' | 'expiryPrecision'>,
  showWeekday = true,
): string {
  const date = formatDate(source.expiryDate, showWeekday);
  const [hour = '00', minute = '00'] = (source.expiryTime ?? '00:00').split(':');
  if (source.expiryPrecision === 'hour') return `${date} ${hour} 時`;
  if (source.expiryPrecision === 'minute') return `${date} ${hour}:${minute}`;
  return date;
}

export function expiryEndTimestamp(source: {
  expiryDate: string;
  expiryTime?: string;
  expiryPrecision?: ExpiryPrecision;
}): number {
  const parts = parseIsoDate(source.expiryDate);
  if (!parts) return Number.NaN;
  const precision = source.expiryPrecision ?? 'day';
  const [hour = 0, minute = 0] = (source.expiryTime ?? '00:00').split(':').map(Number);
  const endHour = precision === 'day' ? 23 : hour;
  const endMinute = precision === 'day' || precision === 'hour' ? 59 : minute;

  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    endHour - TAIPEI_UTC_OFFSET_HOURS,
    endMinute,
    59,
    999,
  );
}

export function taipeiCalendarDayNumber(value: string): number {
  const parts = parseIsoDate(value);
  if (!parts) return Number.NaN;
  return Date.UTC(parts.year, parts.month - 1, parts.day) / millisecondsPerDay;
}
