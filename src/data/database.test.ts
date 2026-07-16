import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addInventoryBatch,
  consumeProduct,
  db,
  deleteCategory,
  ensureDatabaseDefaults,
  removeStock,
  restoreStockOperation,
  setProductArchived,
  updateBatch,
} from './database';

async function getCategoryId(): Promise<string> {
  return (await db.categories.orderBy('sortOrder').first())?.id ?? '';
}

async function addTestBatch(input?: {
  name?: string;
  quantity?: number;
  expiryDate?: string;
  existingProductId?: string;
}): Promise<{ productId: string; batchId: string }> {
  const existingBatchIds = new Set(await db.batches.toCollection().primaryKeys());
  const productId = await addInventoryBatch({
    name: input?.name ?? '測試食品',
    categoryId: await getCategoryId(),
    quantity: input?.quantity ?? 2,
    expiryDate: input?.expiryDate ?? '2026-07-20',
    expiryPrecision: 'day',
    existingProductId: input?.existingProductId,
  });
  const batch = (await db.batches.where('productId').equals(productId).toArray()).find(
    (item) => !existingBatchIds.has(item.id),
  );
  if (!batch) throw new Error('測試批次不存在');
  return { productId, batchId: batch.id };
}

describe('inventory database', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  it('consumes multiple batches in expiry order and groups one user operation', async () => {
    const first = await addTestBatch({ quantity: 2, expiryDate: '2026-07-20' });
    await addTestBatch({
      quantity: 1,
      expiryDate: '2026-07-18',
      existingProductId: first.productId,
    });

    await consumeProduct(first.productId, 2, false);

    const batches = await db.batches.where('productId').equals(first.productId).sortBy('expiryDate');
    expect(batches.map((batch) => batch.quantity)).toEqual([0, 1]);
    const movements = await db.movements.where('type').equals('consume').toArray();
    expect(movements.map((item) => item.change)).toEqual([-1, -1]);
    expect(new Set(movements.map((item) => item.operationId)).size).toBe(1);
    expect(movements.every((item) => item.batchBefore && item.batchAfter)).toBe(true);
  });

  it('discards only the selected batch and requires a reason', async () => {
    const first = await addTestBatch({ quantity: 2, expiryDate: '2026-07-20' });
    const second = await addTestBatch({
      quantity: 3,
      expiryDate: '2026-07-18',
      existingProductId: first.productId,
    });

    await expect(
      removeStock({
        productId: first.productId,
        batchId: first.batchId,
        amount: 1,
        type: 'discard',
        archiveWhenEmpty: false,
      }),
    ).rejects.toThrow('請填寫丟棄原因');

    await removeStock({
      productId: first.productId,
      batchId: first.batchId,
      amount: 1,
      type: 'discard',
      note: '包裝破損',
      archiveWhenEmpty: false,
    });

    expect((await db.batches.get(first.batchId))?.quantity).toBe(1);
    expect((await db.batches.get(second.batchId))?.quantity).toBe(3);
    const movement = await db.movements.where('type').equals('discard').first();
    expect(movement).toMatchObject({ change: -1, note: '包裝破損' });
  });

  it('records quantity adjustments, maintains completedAt, and revives archived products', async () => {
    const { productId, batchId } = await addTestBatch({ quantity: 2 });
    const batch = await db.batches.get(batchId);
    if (!batch) throw new Error('測試批次不存在');

    await updateBatch(batchId, {
      ...batch,
      quantity: 0,
      reason: '實際盤點為零',
    });
    expect((await db.batches.get(batchId))?.completedAt).toBeTruthy();
    const completedBatch = await db.batches.get(batchId);
    if (!completedBatch) throw new Error('測試批次不存在');
    const movementCount = await db.movements.count();
    expect(await updateBatch(batchId, completedBatch)).toBe(false);
    expect(await db.movements.count()).toBe(movementCount);
    await setProductArchived(productId, true);
    expect((await db.products.get(productId))?.archived).toBe(true);

    const zeroBatch = await db.batches.get(batchId);
    if (!zeroBatch) throw new Error('測試批次不存在');
    await updateBatch(batchId, {
      ...zeroBatch,
      quantity: 4,
      reason: '找到另一箱',
    });

    expect((await db.batches.get(batchId))?.completedAt).toBeUndefined();
    expect((await db.products.get(productId))?.archived).toBe(false);
    const adjustments = await db.movements.where('type').equals('adjust').toArray();
    expect(adjustments.map((movement) => movement.change).sort((left, right) => left - right)).toEqual([
      -2,
      4,
    ]);
    expect(adjustments.find((movement) => movement.change === 4)?.operationId).toBe(
      (await db.movements.where('type').equals('unarchive').last())?.operationId,
    );
  });

  it('keeps metadata edits in history and can restore them without changing quantity', async () => {
    const { batchId } = await addTestBatch({ quantity: 2 });
    const batch = await db.batches.get(batchId);
    if (!batch) throw new Error('測試批次不存在');

    await updateBatch(batchId, {
      ...batch,
      expiryDate: '2026-08-01',
      note: '移到冷藏',
    });
    const adjustment = await db.movements.where('type').equals('adjust').last();
    expect(adjustment).toMatchObject({ change: 0, beforeQuantity: 2, afterQuantity: 2 });

    await restoreStockOperation(adjustment!.id);
    expect(await db.batches.get(batchId)).toMatchObject({
      quantity: 2,
      expiryDate: '2026-07-20',
      note: undefined,
    });
    expect(await db.movements.where('type').equals('restore').last()).toMatchObject({
      change: 0,
      revertsMovementId: adjustment!.id,
    });
  });

  it('restores a consumed-and-archived operation once and automatically unarchives', async () => {
    const { productId, batchId } = await addTestBatch({ quantity: 2 });
    await removeStock({
      productId,
      amount: 2,
      type: 'consume',
      archiveWhenEmpty: true,
    });
    const consumption = await db.movements.where('type').equals('consume').last();
    if (!consumption) throw new Error('測試消耗紀錄不存在');
    expect((await db.products.get(productId))?.archived).toBe(true);

    await restoreStockOperation(consumption.id);
    expect((await db.batches.get(batchId))?.quantity).toBe(2);
    expect((await db.products.get(productId))?.archived).toBe(false);
    await expect(restoreStockOperation(consumption.id)).rejects.toThrow('已經復原');
  });

  it('rejects restore after a newer batch edit and leaves the latest state intact', async () => {
    const { productId, batchId } = await addTestBatch({ quantity: 3 });
    await consumeProduct(productId, 1, false);
    const consumption = await db.movements.where('type').equals('consume').last();
    const current = await db.batches.get(batchId);
    if (!consumption || !current) throw new Error('測試資料不存在');
    await updateBatch(batchId, { ...current, note: '後續更新' });

    await expect(restoreStockOperation(consumption.id)).rejects.toThrow('後續已有異動');
    expect(await db.batches.get(batchId)).toMatchObject({ quantity: 2, note: '後續更新' });
    expect(await db.movements.where('type').equals('restore').count()).toBe(0);
  });

  it('restores the archived state when undoing a count that revived a product', async () => {
    const { productId, batchId } = await addTestBatch({ quantity: 1 });
    await consumeProduct(productId, 1, true);
    const emptyBatch = await db.batches.get(batchId);
    if (!emptyBatch) throw new Error('測試批次不存在');
    await updateBatch(batchId, {
      ...emptyBatch,
      quantity: 2,
      reason: '盤點找到庫存',
    });
    const adjustment = (await db.movements.where('type').equals('adjust').toArray()).find(
      (movement) => movement.change === 2,
    );
    if (!adjustment) throw new Error('測試盤點紀錄不存在');
    expect((await db.products.get(productId))?.archived).toBe(false);

    const restoreOperationId = await restoreStockOperation(adjustment.id);
    expect((await db.batches.get(batchId))?.quantity).toBe(0);
    expect((await db.products.get(productId))?.archived).toBe(true);
    expect(
      (await db.movements.where('operationId').equals(restoreOperationId).toArray()).some(
        (movement) => movement.type === 'archive',
      ),
    ).toBe(true);
  });

  it('does not allow hiding positive inventory by archiving it', async () => {
    const { productId } = await addTestBatch({ quantity: 1 });
    await expect(setProductArchived(productId, true)).rejects.toThrow('仍有庫存');
    expect((await db.products.get(productId))?.archived).toBe(false);
    expect(await db.movements.where('type').equals('archive').count()).toBe(0);
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

  it('migrates legacy movements to independent operation ids', async () => {
    await db.close();
    await db.delete();
    const legacy = new Dexie('expiry-tracker');
    legacy.version(2).stores({
      products: '&id, normalizedName, categoryId, updatedAt',
      batches: '&id, productId, expiryDate, quantity, [productId+expiryDate]',
      movements: '&id, productId, batchId, type, createdAt',
      categories: '&id, normalizedName, sortOrder',
      preferences: '&id',
    });
    await legacy.open();
    await legacy.table('products').add({
      id: 'legacy-product',
      name: '舊版封存商品',
      normalizedName: '舊版封存商品',
      categoryId: '',
      archived: true,
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-15T00:00:00.000Z',
    });
    await legacy.table('batches').add({
      id: 'legacy-batch',
      productId: 'legacy-product',
      quantity: 1,
      initialQuantity: 2,
      expiryDate: '2026-08-10',
      expiryPrecision: 'day',
      createdAt: '2026-07-15T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
    });
    await legacy.table('movements').add({
      id: 'legacy-movement',
      productId: 'legacy-product',
      batchId: 'legacy-batch',
      type: 'consume',
      change: -1,
      beforeQuantity: 2,
      afterQuantity: 1,
      createdAt: '2026-07-16T00:00:00.000Z',
    });
    legacy.close();

    await db.open();
    expect((await db.movements.get('legacy-movement'))?.operationId).toBe('legacy-movement');
    expect((await db.products.get('legacy-product'))?.archived).toBe(false);
    expect(
      (await db.movements.where('type').equals('unarchive').toArray()).some(
        (movement) => movement.note === '資料升級時修正有庫存的封存狀態',
      ),
    ).toBe(true);
  });
});
