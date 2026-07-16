import { useLiveQuery } from 'dexie-react-hooks';
import { db, defaultPreferences } from '../data/database';
import { buildInventoryRows } from '../domain/inventory';
import { expiryEndTimestamp } from '../domain/taipeiTime';

export function usePreferences() {
  return useLiveQuery(() => db.preferences.get('app'), [], defaultPreferences) ?? defaultPreferences;
}

export function useCategories() {
  return useLiveQuery(
    () => db.categories.orderBy('sortOrder').toArray(),
    [],
    [],
  ) ?? [];
}

export function useInventoryRows() {
  return useLiveQuery(async () => {
    const [products, batches] = await Promise.all([
      db.products.toArray(),
      db.batches.toArray(),
    ]);
    return buildInventoryRows(products, batches);
  }, [], []) ?? [];
}

export function useArchivedProducts() {
  return useLiveQuery(
    async () => (await db.products.filter((product) => product.archived).sortBy('updatedAt')).reverse(),
    [],
    [],
  ) ?? [];
}

export function useProductBatches(productId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!productId) return [];
      return (await db.batches.where('productId').equals(productId).toArray()).sort((left, right) => {
        if (left.quantity === 0 && right.quantity > 0) return 1;
        if (left.quantity > 0 && right.quantity === 0) return -1;
        return (
          expiryEndTimestamp(left) - expiryEndTimestamp(right) ||
          left.createdAt.localeCompare(right.createdAt)
        );
      });
    },
    [productId],
    [],
  ) ?? [];
}
