import { useLiveQuery } from 'dexie-react-hooks';
import { db, defaultPreferences } from '../data/database';
import { buildInventoryRows } from '../domain/inventory';

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
