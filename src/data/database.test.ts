import { beforeEach, describe, expect, it } from 'vitest';
import {
  addInventoryBatch,
  consumeProduct,
  db,
  deleteCategory,
  ensureDatabaseDefaults,
} from './database';

describe('inventory database', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  it('consumes multiple batches in expiry order', async () => {
    const category = await db.categories.orderBy('sortOrder').first();
    const productId = await addInventoryBatch({
      name: '測試食品',
      categoryId: category?.id ?? '',
      quantity: 2,
      expiryDate: '2026-07-20',
      expiryPrecision: 'day',
    });
    await addInventoryBatch({
      name: '測試食品',
      categoryId: category?.id ?? '',
      quantity: 1,
      expiryDate: '2026-07-18',
      expiryPrecision: 'day',
      existingProductId: productId,
    });

    await consumeProduct(productId, 2, false);

    const batches = await db.batches.where('productId').equals(productId).sortBy('expiryDate');
    expect(batches.map((batch) => batch.quantity)).toEqual([0, 1]);
    expect((await db.movements.where('type').equals('consume').toArray()).map((item) => item.change)).toEqual([-1, -1]);
  });

  it('allows deleting any category and keeps its products as uncategorized', async () => {
    const category = await db.categories.orderBy('sortOrder').first();
    if (!category) throw new Error('測試分類不存在');
    const productId = await addInventoryBatch({
      name: '分類測試',
      categoryId: category.id,
      quantity: 1,
      expiryDate: '2026-07-20',
      expiryPrecision: 'day',
    });

    expect(await deleteCategory(category.id)).toBe(1);
    expect((await db.products.get(productId))?.categoryId).toBe('');
    expect(await db.categories.get(category.id)).toBeUndefined();
  });
});
