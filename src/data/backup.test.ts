import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBackup,
  parseBackupFile,
  restoreBackup,
  type BackupPayload,
} from './backup';
import {
  addInventoryBatch,
  db,
  ensureDatabaseDefaults,
  removeStock,
} from './database';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function jsonFile(value: unknown): File {
  const text = JSON.stringify(value);
  return {
    size: new Blob([text]).size,
    text: async () => text,
  } as File;
}

async function addProduct(name = '備份測試', quantity = 2) {
  const categoryId = (await db.categories.orderBy('sortOrder').first())?.id ?? '';
  const productId = await addInventoryBatch({
    name,
    categoryId,
    quantity,
    expiryDate: '2026-08-10',
    expiryPrecision: 'day',
    note: '原始批次',
  });
  const batch = await db.batches.where('productId').equals(productId).first();
  if (!batch) throw new Error('測試批次不存在');
  return { productId, batch };
}

describe('backup safety', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  it('round-trips schema v3 operations, snapshots, and discard history', async () => {
    const { productId, batch } = await addProduct();
    await removeStock({
      productId,
      batchId: batch.id,
      amount: 1,
      type: 'discard',
      note: '外包裝破損',
      archiveWhenEmpty: false,
    });

    const exported = await createBackup();
    expect(exported.schemaVersion).toBe(3);
    expect(exported.data.movements.find((movement) => movement.type === 'discard')).toMatchObject({
      operationId: expect.any(String),
      batchBefore: expect.any(Object),
      batchAfter: expect.any(Object),
    });

    const parsed = await parseBackupFile(jsonFile(exported));
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
    await restoreBackup(parsed);

    expect(await db.products.count()).toBe(1);
    expect((await db.batches.get(batch.id))?.quantity).toBe(1);
    expect(await db.movements.where('type').equals('discard').count()).toBe(1);
  });

  it('migrates v1 defaults without inventing operation groups from timestamps', async () => {
    const payload = clone(await createBackup()) as BackupPayload & {
      data: {
        preferences: Record<string, unknown>;
        batches: Array<Record<string, unknown>>;
      };
    };
    payload.schemaVersion = 1;
    delete (payload.data.preferences as { themeMode?: unknown }).themeMode;
    delete (payload.data.preferences as { showWeekday?: unknown }).showWeekday;

    const parsed = await parseBackupFile(jsonFile(payload));
    expect(parsed.data.preferences.themeMode).toBe('system');
    expect(parsed.data.preferences.showWeekday).toBe(true);
  });

  it('gives every legacy v2 movement its own operation id', async () => {
    await addProduct('第一項');
    await addProduct('第二項');
    const payload = clone(await createBackup()) as BackupPayload;
    payload.schemaVersion = 2;
    const sameTimestamp = '2026-07-16T00:00:00.000Z';
    const legacyMovements = payload.data.movements.map((movement) => {
      const legacy = movement as typeof movement & {
        operationId?: string;
        batchBefore?: unknown;
        batchAfter?: unknown;
      };
      delete legacy.operationId;
      delete legacy.batchBefore;
      delete legacy.batchAfter;
      legacy.createdAt = sameTimestamp;
      return legacy;
    });
    payload.data.movements = legacyMovements;

    const parsed = await parseBackupFile(jsonFile(payload));
    expect(parsed.data.movements.map((movement) => movement.operationId)).toEqual(
      parsed.data.movements.map((movement) => movement.id),
    );
  });

  it('rejects broken active references before clearing the current database', async () => {
    const { productId } = await addProduct('保留原資料');
    const payload = clone(await createBackup());
    payload.data.products[0].categoryId = 'missing-category';

    await expect(restoreBackup(payload)).rejects.toThrow('參照不存在的分類');
    expect(await db.products.get(productId)).toMatchObject({ name: '保留原資料' });
    expect(await db.products.count()).toBe(1);
  });

  it('rejects duplicate table ids and invalid movement arithmetic', async () => {
    const { productId } = await addProduct();
    const duplicatePayload = clone(await createBackup());
    duplicatePayload.data.categories.push(clone(duplicatePayload.data.categories[0]));
    await expect(restoreBackup(duplicatePayload)).rejects.toThrow('分類 ID 重複');

    const movementPayload = clone(await createBackup());
    movementPayload.data.movements[0].afterQuantity += 1;
    await expect(restoreBackup(movementPayload)).rejects.toThrow('數量計算不一致');

    const invalidRevertPayload = clone(await createBackup());
    invalidRevertPayload.data.movements[0].revertsMovementId = 'missing-movement';
    await expect(restoreBackup(invalidRevertPayload)).rejects.toThrow('復原類型不正確');

    const orphanMovementPayload = clone(await createBackup());
    orphanMovementPayload.data.movements[0].batchId = 'missing-batch';
    await expect(restoreBackup(orphanMovementPayload)).rejects.toThrow('參照不存在的批次');

    await addInventoryBatch({
      name: '備份測試',
      categoryId: (await db.products.get(productId))?.categoryId ?? '',
      quantity: 1,
      expiryDate: '2026-09-01',
      expiryPrecision: 'day',
      existingProductId: productId,
    });
    const groupedPayload = clone(await createBackup());
    const addMovements = groupedPayload.data.movements.filter(
      (movement) => movement.type === 'add',
    );
    addMovements[1].operationId = addMovements[0].operationId;
    addMovements[1].createdAt = addMovements[0].createdAt;
    await expect(restoreBackup(groupedPayload)).rejects.toThrow('異動分組不一致');
  });

  it('rolls back all cleared and written tables when a bulk write fails', async () => {
    await addProduct('目標備份');
    const target = await createBackup();
    await addProduct('目前新增');
    const currentNames = (await db.products.toArray()).map((product) => product.name).sort();
    vi.spyOn(db.batches, 'bulkAdd').mockRejectedValueOnce(new Error('模擬寫入失敗'));

    await expect(restoreBackup(target)).rejects.toThrow('模擬寫入失敗');
    expect((await db.products.toArray()).map((product) => product.name).sort()).toEqual(
      currentNames,
    );
    expect(await db.batches.count()).toBe(2);
  });

  it('repairs legacy hidden inventory and stale completedAt during preparation', async () => {
    const { productId, batch } = await addProduct();
    const payload = clone(await createBackup());
    payload.data.products[0].archived = true;
    payload.data.batches[0].completedAt = '2026-07-16T00:00:00.000Z';

    await restoreBackup(payload);
    expect((await db.products.get(productId))?.archived).toBe(false);
    expect((await db.batches.get(batch.id))?.completedAt).toBeUndefined();
  });

  it('preserves an intentionally empty category list', async () => {
    await addProduct();
    const payload = clone(await createBackup());
    payload.data.categories = [];
    payload.data.products = payload.data.products.map((product) => ({
      ...product,
      categoryId: '',
    }));

    await restoreBackup(payload);
    await ensureDatabaseDefaults();
    expect(await db.categories.count()).toBe(0);
    expect((await db.products.toArray())[0].categoryId).toBe('');
  });

  it('rejects unsupported future backup versions with a clear parse error', async () => {
    const payload = clone(await createBackup()) as BackupPayload & { schemaVersion: number };
    payload.schemaVersion = 4;
    await expect(parseBackupFile(jsonFile(payload))).rejects.toThrow('版本不支援');
  });
});
