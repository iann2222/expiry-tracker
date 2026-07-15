import type { AppPreferences, Batch, ExpiryStatus, InventoryRow, Product } from '../types';
import { expiryEndTimestamp, getTaipeiToday, taipeiCalendarDayNumber } from './taipeiTime';

type ExpirySource = string | Pick<Batch, 'expiryDate' | 'expiryTime' | 'expiryPrecision'>;

function toExpirySource(value: ExpirySource) {
  return typeof value === 'string'
    ? { expiryDate: value, expiryPrecision: 'day' as const }
    : value;
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, '')
    .toLocaleLowerCase('zh-TW');
}

export function daysUntil(expiryDate: string, today = new Date()): number {
  return taipeiCalendarDayNumber(expiryDate) - taipeiCalendarDayNumber(getTaipeiToday(today));
}

export function getExpiryStatus(
  expiry: ExpirySource,
  preferences: Pick<AppPreferences, 'urgentDays' | 'soonDays'>,
  today = new Date(),
): ExpiryStatus {
  const source = toExpirySource(expiry);
  const days = daysUntil(source.expiryDate, today);

  if (today.getTime() > expiryEndTimestamp(source)) return 'expired';
  if (days <= preferences.urgentDays) return 'urgent';
  if (days <= preferences.soonDays) return 'soon';
  return 'safe';
}

export function formatRelativeExpiry(expiry: ExpirySource, today = new Date()): string {
  const source = toExpirySource(expiry);
  const days = daysUntil(source.expiryDate, today);

  if (today.getTime() > expiryEndTimestamp(source)) {
    return days < 0 ? `已過期 ${Math.abs(days)} 天` : '今天已過期';
  }
  if (days === 0) return '今天到期';
  return `剩 ${days} 天`;
}

export function getStatusLabel(
  status: ExpiryStatus,
  preferences: Pick<AppPreferences, 'urgentDays' | 'soonDays'>,
): string {
  switch (status) {
    case 'expired':
      return '已過期';
    case 'urgent':
      return preferences.urgentDays === 0 ? '今天到期' : `${preferences.urgentDays} 天內`;
    case 'soon':
      return `${preferences.urgentDays + 1}–${preferences.soonDays} 天`;
    case 'safe':
      return `${preferences.soonDays + 1} 天以上`;
  }
}

export function buildInventoryRows(products: Product[], batches: Batch[]): InventoryRow[] {
  return products
    .filter((product) => !product.archived)
    .map((product) => {
      const productBatches = batches
        .filter((batch) => batch.productId === product.id && batch.quantity > 0)
        .sort((left, right) => {
          const byExpiry = expiryEndTimestamp(left) - expiryEndTimestamp(right);
          return byExpiry || left.createdAt.localeCompare(right.createdAt);
        });

      return {
        product,
        batches: productBatches,
        totalQuantity: productBatches.reduce((total, batch) => total + batch.quantity, 0),
        nearestBatch: productBatches[0],
      };
    })
    .sort((left, right) => {
      if (!left.nearestBatch && !right.nearestBatch) {
        return left.product.name.localeCompare(right.product.name, 'zh-Hant');
      }
      if (!left.nearestBatch) return 1;
      if (!right.nearestBatch) return -1;
      return expiryEndTimestamp(left.nearestBatch) - expiryEndTimestamp(right.nearestBatch);
    });
}
