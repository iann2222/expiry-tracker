import Dexie, { type Table } from 'dexie';
import type {
  AppPreferences,
  Batch,
  BatchMovementSnapshot,
  Category,
  ExpiryPrecision,
  MovementType,
  Product,
  StockMovement,
} from '../types';
import { normalizeName } from '../domain/inventory';
import { expiryEndTimestamp, parseIsoDate, toIsoDate } from '../domain/taipeiTime';
import { createId } from '../utils/createId';

class ExpiryTrackerDatabase extends Dexie {
  products!: Table<Product, string>;
  batches!: Table<Batch, string>;
  movements!: Table<StockMovement, string>;
  categories!: Table<Category, string>;
  preferences!: Table<AppPreferences, string>;

  constructor() {
    super('expiry-tracker');

    this.version(1).stores({
      products: '&id, normalizedName, categoryId, updatedAt',
      batches: '&id, productId, expiryDate, quantity, [productId+expiryDate]',
      movements: '&id, productId, batchId, type, createdAt',
      categories: '&id, normalizedName, sortOrder',
      preferences: '&id',
    });

    this.version(2)
      .stores({
        products: '&id, normalizedName, categoryId, updatedAt',
        batches: '&id, productId, expiryDate, quantity, [productId+expiryDate]',
        movements: '&id, productId, batchId, type, createdAt',
        categories: '&id, normalizedName, sortOrder',
        preferences: '&id',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<Batch, string>('batches')
          .toCollection()
          .modify((batch) => {
            batch.expiryPrecision ??= 'day';
          });
        await transaction
          .table<AppPreferences, string>('preferences')
          .toCollection()
          .modify((preferences) => {
            preferences.themeMode ??= 'system';
            preferences.showWeekday ??= true;
            if (
              preferences.colors.expired === '#9B2C2C' &&
              preferences.colors.urgent === '#D64545' &&
              preferences.colors.soon === '#D97706' &&
              preferences.colors.safe === '#3F7D5B'
            ) {
              preferences.colors = {
                expired: '#F0747D',
                urgent: '#FF8A80',
                soon: '#F6B85F',
                safe: '#75C99A',
              };
            }
          });
      });

    this.version(3)
      .stores({
        products: '&id, normalizedName, categoryId, updatedAt',
        batches: '&id, productId, expiryDate, quantity, [productId+expiryDate]',
        movements:
          '&id, productId, batchId, type, createdAt, operationId, revertsMovementId',
        categories: '&id, normalizedName, sortOrder',
        preferences: '&id',
      })
      .upgrade(async (transaction) => {
        const movements = transaction.table<StockMovement, string>('movements');
        await movements
          .toCollection()
          .modify((movement) => {
            movement.operationId ??= movement.id;
          });

        const quantitiesByProduct = new Map<string, number>();
        for (const batch of await transaction.table<Batch, string>('batches').toArray()) {
          quantitiesByProduct.set(
            batch.productId,
            (quantitiesByProduct.get(batch.productId) ?? 0) + batch.quantity,
          );
        }
        const now = new Date().toISOString();
        const repairedProductIds: string[] = [];
        await transaction
          .table<Product, string>('products')
          .toCollection()
          .modify((product) => {
            if (product.archived && (quantitiesByProduct.get(product.id) ?? 0) > 0) {
              product.archived = false;
              product.updatedAt = now;
              repairedProductIds.push(product.id);
            }
          });
        if (repairedProductIds.length > 0) {
          await movements.bulkAdd(
            repairedProductIds.map((productId) => {
              const id = createId();
              return {
                id,
                operationId: id,
                productId,
                type: 'unarchive',
                change: 0,
                beforeQuantity: 0,
                afterQuantity: 0,
                note: '資料升級時修正有庫存的封存狀態',
                createdAt: now,
              };
            }),
          );
        }
      });
  }
}

export const db = new ExpiryTrackerDatabase();

export const defaultPreferences: AppPreferences = {
  id: 'app',
  urgentDays: 7,
  soonDays: 30,
  colors: {
    expired: '#F0747D',
    urgent: '#FF8A80',
    soon: '#F6B85F',
    safe: '#75C99A',
  },
  themeMode: 'system',
  showWeekday: true,
  updatedAt: new Date(0).toISOString(),
};

const defaultCategoryNames = [
  '主食／泡麵',
  '零食',
  '飲料',
  '罐頭／調理食品',
  '調味料',
  '沖泡食品',
  '冷藏食品',
  '冷凍食品',
  '其他',
];

type StockRemovalType = Extract<MovementType, 'consume' | 'discard'>;

function normalizeOptionalText(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function isValidIsoDate(value: string): boolean {
  const parts = parseIsoDate(value);
  return Boolean(parts && toIsoDate(parts) === value);
}

function normalizeExpiryTime(
  precision: ExpiryPrecision,
  value: string | undefined,
): string | undefined {
  if (precision === 'day') return undefined;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')) {
    throw new Error('有效期限時間格式不正確');
  }
  const [hour, minute] = value!.split(':');
  return precision === 'hour' ? `${hour}:00` : `${hour}:${minute}`;
}

function validateBatchFields(input: {
  quantity: number;
  expiryDate: string;
  expiryTime?: string;
  expiryPrecision: ExpiryPrecision;
  purchaseDate?: string;
}): { expiryTime?: string; purchaseDate?: string } {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) {
    throw new Error('數量必須是 0 以上的整數');
  }
  if (!isValidIsoDate(input.expiryDate)) throw new Error('有效期限日期不正確');
  const purchaseDate = normalizeOptionalText(input.purchaseDate);
  if (purchaseDate && !isValidIsoDate(purchaseDate)) throw new Error('購買日期不正確');
  return {
    expiryTime: normalizeExpiryTime(input.expiryPrecision, input.expiryTime),
    purchaseDate,
  };
}

export function createBatchMovementSnapshot(batch: Batch): BatchMovementSnapshot {
  return {
    quantity: batch.quantity,
    expiryDate: batch.expiryDate,
    expiryTime: batch.expiryTime,
    expiryPrecision: batch.expiryPrecision,
    purchaseDate: batch.purchaseDate,
    note: batch.note,
    completedAt: batch.completedAt,
  };
}

function batchMatchesSnapshot(batch: Batch, snapshot: BatchMovementSnapshot): boolean {
  const current = createBatchMovementSnapshot(batch);
  return (
    current.quantity === snapshot.quantity &&
    current.expiryDate === snapshot.expiryDate &&
    current.expiryTime === snapshot.expiryTime &&
    current.expiryPrecision === snapshot.expiryPrecision &&
    current.purchaseDate === snapshot.purchaseDate &&
    current.note === snapshot.note &&
    current.completedAt === snapshot.completedAt
  );
}

function describeBatchChanges(
  before: BatchMovementSnapshot,
  after: BatchMovementSnapshot,
  reason?: string,
): string {
  const changes: string[] = [];
  if (before.quantity !== after.quantity) {
    changes.push(`盤點數量 ${before.quantity} → ${after.quantity}`);
  }
  if (
    before.expiryDate !== after.expiryDate ||
    before.expiryTime !== after.expiryTime ||
    before.expiryPrecision !== after.expiryPrecision
  ) {
    changes.push(`有效期限 ${before.expiryDate} → ${after.expiryDate}`);
  }
  if (before.purchaseDate !== after.purchaseDate) changes.push('更新購買日期');
  if (before.note !== after.note) changes.push('更新批次備註');
  const normalizedReason = normalizeOptionalText(reason);
  return normalizedReason ? `${changes.join('；')}（${normalizedReason}）` : changes.join('；');
}

export async function ensureDatabaseDefaults(): Promise<void> {
  await db.transaction('rw', db.preferences, db.categories, async () => {
    const preferences = await db.preferences.get('app');
    const isFirstRun = !preferences;
    if (!preferences) {
      await db.preferences.add({
        ...defaultPreferences,
        updatedAt: new Date().toISOString(),
      });
    }

    if (isFirstRun && (await db.categories.count()) === 0) {
      const createdAt = new Date().toISOString();
      await db.categories.bulkAdd(
        defaultCategoryNames.map((name, index) => ({
          id: createId(),
          name,
          normalizedName: normalizeName(name),
          isDefault: true,
          sortOrder: index,
          createdAt,
        })),
      );
    }
  });
}

export async function addInventoryBatch(input: {
  name: string;
  categoryId: string;
  quantity: number;
  expiryDate: string;
  expiryTime?: string;
  expiryPrecision: Batch['expiryPrecision'];
  purchaseDate?: string;
  note?: string;
  existingProductId?: string;
}): Promise<string> {
  const normalizedName = normalizeName(input.name);
  if (!input.existingProductId && !normalizedName) throw new Error('請輸入商品名稱');
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) {
    throw new Error('數量必須是正整數');
  }
  const normalizedFields = validateBatchFields(input);
  const now = new Date().toISOString();
  const batchId = createId();
  const operationId = createId();

  return db.transaction(
    'rw',
    db.products,
    db.batches,
    db.movements,
    db.categories,
    async () => {
      let product: Product | undefined;

      if (input.existingProductId) {
        product = await db.products.get(input.existingProductId);
        if (!product) throw new Error('找不到要補貨的商品');
      }

      if (!product) {
        if (input.categoryId && !(await db.categories.get(input.categoryId))) {
          throw new Error('找不到所選分類');
        }
        if (await db.products.where('normalizedName').equals(normalizedName).first()) {
          throw new Error('已有相同名稱的商品');
        }
        product = {
          id: createId(),
          name: input.name.trim(),
          normalizedName,
          categoryId: input.categoryId,
          archived: false,
          createdAt: now,
          updatedAt: now,
        };
        await db.products.add(product);
      } else if (product.archived) {
        await db.products.update(product.id, { archived: false, updatedAt: now });
        await db.movements.add({
          id: createId(),
          operationId,
          productId: product.id,
          type: 'unarchive',
          change: 0,
          beforeQuantity: 0,
          afterQuantity: 0,
          createdAt: now,
        });
      }

      const batch: Batch = {
        id: batchId,
        productId: product.id,
        quantity: input.quantity,
        initialQuantity: input.quantity,
        expiryDate: input.expiryDate,
        expiryTime: normalizedFields.expiryTime,
        expiryPrecision: input.expiryPrecision,
        purchaseDate: normalizedFields.purchaseDate,
        note: normalizeOptionalText(input.note),
        createdAt: now,
        updatedAt: now,
      };

      await db.batches.add(batch);
      await db.products.update(product.id, { updatedAt: now });
      await db.movements.add({
        id: createId(),
        operationId,
        productId: product.id,
        batchId,
        type: 'add',
        change: input.quantity,
        beforeQuantity: 0,
        afterQuantity: input.quantity,
        batchAfter: createBatchMovementSnapshot(batch),
        createdAt: now,
      });

      return product.id;
    },
  );
}

export async function removeStock(input: {
  productId: string;
  batchId?: string;
  amount: number;
  type: StockRemovalType;
  note?: string;
  archiveWhenEmpty: boolean;
}): Promise<string> {
  if (!Number.isSafeInteger(input.amount) || input.amount < 1) {
    throw new Error('處理數量必須是正整數');
  }
  if (input.type === 'discard' && !input.batchId) {
    throw new Error('丟棄前請指定批次');
  }
  const note = normalizeOptionalText(input.note);
  if (input.type === 'discard' && !note) throw new Error('請填寫丟棄原因');

  const operationId = createId();
  await db.transaction('rw', db.products, db.batches, db.movements, async () => {
    const product = await db.products.get(input.productId);
    if (!product) throw new Error('找不到這個商品');

    const allBatches = await db.batches.where('productId').equals(input.productId).toArray();
    const batches = allBatches
      .filter((batch) => batch.quantity > 0)
      .filter((batch) => !input.batchId || batch.id === input.batchId)
      .sort((left, right) => {
        const byExpiry = expiryEndTimestamp(left) - expiryEndTimestamp(right);
        const byPurchase = (left.purchaseDate ?? '9999-12-31').localeCompare(
          right.purchaseDate ?? '9999-12-31',
        );
        return byExpiry || byPurchase || left.createdAt.localeCompare(right.createdAt);
      });

    if (input.batchId && batches.length === 0) throw new Error('這個批次目前沒有庫存');
    const availableQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (input.amount > availableQuantity) throw new Error('處理數量不可大於可用庫存');
    const productQuantity = allBatches.reduce((sum, batch) => sum + batch.quantity, 0);

    const now = new Date().toISOString();
    let remainingToRemove = input.amount;
    for (const batch of batches) {
      if (remainingToRemove === 0) break;
      const removed = Math.min(batch.quantity, remainingToRemove);
      const beforeSnapshot = createBatchMovementSnapshot(batch);
      const afterQuantity = batch.quantity - removed;
      const updatedBatch: Batch = {
        ...batch,
        quantity: afterQuantity,
        updatedAt: now,
        completedAt: afterQuantity === 0 ? now : undefined,
      };
      await db.batches.put(updatedBatch);
      await db.movements.add({
        id: createId(),
        operationId,
        productId: input.productId,
        batchId: batch.id,
        type: input.type,
        change: -removed,
        beforeQuantity: batch.quantity,
        afterQuantity,
        note,
        batchBefore: beforeSnapshot,
        batchAfter: createBatchMovementSnapshot(updatedBatch),
        createdAt: now,
      });
      remainingToRemove -= removed;
    }

    const remainingQuantity = productQuantity - input.amount;
    await db.products.update(input.productId, {
      archived:
        remainingQuantity > 0
          ? false
          : remainingQuantity === 0 && input.archiveWhenEmpty
            ? true
            : product.archived,
      updatedAt: now,
    });
    if (product.archived && remainingQuantity > 0) {
      await db.movements.add({
        id: createId(),
        operationId,
        productId: input.productId,
        type: 'unarchive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        note: '處理庫存時修正封存狀態',
        createdAt: now,
      });
    }
    if (remainingQuantity === 0 && input.archiveWhenEmpty && !product.archived) {
      await db.movements.add({
        id: createId(),
        operationId,
        productId: input.productId,
        type: 'archive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        createdAt: now,
      });
    }
  });
  return operationId;
}

export async function consumeProduct(
  productId: string,
  amount: number,
  archiveWhenEmpty: boolean,
): Promise<void> {
  await removeStock({
    productId,
    amount,
    type: 'consume',
    archiveWhenEmpty,
  });
}

export async function setProductArchived(productId: string, archived: boolean): Promise<void> {
  const now = new Date().toISOString();
  await db.transaction('rw', db.products, db.batches, db.movements, async () => {
    const product = await db.products.get(productId);
    if (!product || product.archived === archived) return;
    if (archived) {
      const quantity = (await db.batches.where('productId').equals(productId).toArray()).reduce(
        (sum, batch) => sum + batch.quantity,
        0,
      );
      if (quantity > 0) throw new Error('仍有庫存的商品不能封存');
    }
    await db.products.update(productId, { archived, updatedAt: now });
    await db.movements.add({
      id: createId(),
      operationId: createId(),
      productId,
      type: archived ? 'archive' : 'unarchive',
      change: 0,
      beforeQuantity: 0,
      afterQuantity: 0,
      createdAt: now,
    });
  });
}

export async function updateBatch(
  batchId: string,
  input: {
    quantity: number;
    expiryDate: string;
    expiryTime?: string;
    expiryPrecision: ExpiryPrecision;
    purchaseDate?: string;
    note?: string;
    reason?: string;
  },
): Promise<boolean> {
  const normalizedFields = validateBatchFields(input);
  const normalizedNote = normalizeOptionalText(input.note);
  const reason = normalizeOptionalText(input.reason);

  return db.transaction('rw', db.products, db.batches, db.movements, async () => {
    const batch = await db.batches.get(batchId);
    if (!batch) throw new Error('找不到這個批次');
    const product = await db.products.get(batch.productId);
    if (!product) throw new Error('找不到這個商品');
    if (batch.quantity !== input.quantity && !reason) {
      throw new Error('變更盤點數量時請填寫調整原因');
    }

    const now = new Date().toISOString();
    const updatedBatch: Batch = {
      ...batch,
      quantity: input.quantity,
      expiryDate: input.expiryDate,
      expiryTime:
        input.expiryPrecision === 'day' && batch.expiryPrecision === 'day'
          ? batch.expiryTime
          : normalizedFields.expiryTime,
      expiryPrecision: input.expiryPrecision,
      purchaseDate: normalizedFields.purchaseDate,
      note: normalizedNote,
      completedAt:
        input.quantity === 0
          ? batch.quantity === 0
            ? batch.completedAt
            : now
          : undefined,
      updatedAt: now,
    };
    const beforeSnapshot = createBatchMovementSnapshot(batch);
    const afterSnapshot = createBatchMovementSnapshot(updatedBatch);
    if (batchMatchesSnapshot(batch, afterSnapshot)) return false;

    const operationId = createId();
    await db.batches.put(updatedBatch);
    await db.products.update(product.id, {
      archived: input.quantity > 0 ? false : product.archived,
      updatedAt: now,
    });
    await db.movements.add({
      id: createId(),
      operationId,
      productId: product.id,
      batchId: batch.id,
      type: 'adjust',
      change: input.quantity - batch.quantity,
      beforeQuantity: batch.quantity,
      afterQuantity: input.quantity,
      note: describeBatchChanges(beforeSnapshot, afterSnapshot, reason),
      batchBefore: beforeSnapshot,
      batchAfter: afterSnapshot,
      createdAt: now,
    });
    if (product.archived && input.quantity > 0) {
      await db.movements.add({
        id: createId(),
        operationId,
        productId: product.id,
        type: 'unarchive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        note: '盤點恢復庫存',
        createdAt: now,
      });
    }
    return true;
  });
}

const reversibleMovementTypes = new Set<MovementType>(['consume', 'discard', 'adjust']);

export async function restoreStockOperation(movementId: string): Promise<string> {
  const restoreOperationId = createId();
  await db.transaction('rw', db.products, db.batches, db.movements, async () => {
    const anchor = await db.movements.get(movementId);
    if (!anchor) throw new Error('找不到這筆異動');
    const sourceOperationId = anchor.operationId ?? anchor.id;
    const sourceMovements = anchor.operationId
      ? await db.movements.filter((movement) => movement.operationId === sourceOperationId).toArray()
      : [anchor];
    const targets = sourceMovements.filter(
      (movement) => reversibleMovementTypes.has(movement.type) && movement.batchId,
    );
    if (targets.length === 0) throw new Error('這筆異動不支援復原');
    if (new Set(targets.map((movement) => movement.productId)).size !== 1) {
      throw new Error('異動資料不一致，無法復原');
    }
    if (
      new Set(targets.map((movement) => movement.type)).size !== 1 ||
      new Set(targets.map((movement) => movement.createdAt)).size !== 1 ||
      new Set(targets.map((movement) => movement.batchId)).size !== targets.length ||
      (targets[0].type !== 'consume' && targets.length > 1)
    ) {
      throw new Error('異動分組不一致，無法復原');
    }

    const targetIds = new Set(targets.map((movement) => movement.id));
    const alreadyRestored = await db.movements
      .filter(
        (movement) =>
          movement.type === 'restore' &&
          Boolean(movement.revertsMovementId && targetIds.has(movement.revertsMovementId)),
      )
      .first();
    if (alreadyRestored) throw new Error('這筆異動已經復原');

    const currentBatches = new Map<string, Batch>();
    for (const movement of targets) {
      const batch = await db.batches.get(movement.batchId!);
      if (!batch) throw new Error('原批次已不存在，請改用盤點調整');
      if (batch.productId !== movement.productId) {
        throw new Error('原批次與商品資料不一致，無法復原');
      }
      if (
        batch.updatedAt !== movement.createdAt ||
        (movement.batchAfter
          ? !batchMatchesSnapshot(batch, movement.batchAfter)
          : batch.quantity !== movement.afterQuantity)
      ) {
        throw new Error('批次後續已有異動，請改用盤點調整');
      }
      currentBatches.set(batch.id, batch);
    }

    const now = new Date().toISOString();
    for (const movement of targets) {
      const batch = currentBatches.get(movement.batchId!)!;
      const restoredSnapshot: BatchMovementSnapshot = movement.batchBefore ?? {
        ...createBatchMovementSnapshot(batch),
        quantity: movement.beforeQuantity,
        completedAt: movement.beforeQuantity > 0 ? undefined : batch.completedAt,
      };
      const restoredBatch: Batch = {
        ...batch,
        ...restoredSnapshot,
        updatedAt: now,
      };
      await db.batches.put(restoredBatch);
      await db.movements.add({
        id: createId(),
        operationId: restoreOperationId,
        productId: movement.productId,
        batchId: movement.batchId,
        type: 'restore',
        change: restoredBatch.quantity - batch.quantity,
        beforeQuantity: batch.quantity,
        afterQuantity: restoredBatch.quantity,
        note: `復原${movement.type === 'consume' ? '消耗' : movement.type === 'discard' ? '丟棄' : '盤點調整'}`,
        revertsMovementId: movement.id,
        batchBefore: createBatchMovementSnapshot(batch),
        batchAfter: createBatchMovementSnapshot(restoredBatch),
        createdAt: now,
      });
    }

    const productId = targets[0].productId;
    const product = await db.products.get(productId);
    if (!product) throw new Error('原商品已不存在，無法復原');
    const totalQuantity = (await db.batches.where('productId').equals(productId).toArray()).reduce(
      (sum, batch) => sum + batch.quantity,
      0,
    );
    const restoreArchivedState =
      totalQuantity === 0 &&
      sourceMovements.some((movement) => movement.type === 'unarchive');
    await db.products.update(productId, {
      archived: restoreArchivedState ? true : totalQuantity > 0 ? false : product.archived,
      updatedAt: now,
    });
    if (restoreArchivedState && !product.archived) {
      await db.movements.add({
        id: createId(),
        operationId: restoreOperationId,
        productId,
        type: 'archive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        note: '復原盤點時恢復封存狀態',
        createdAt: now,
      });
    } else if (product.archived && totalQuantity > 0) {
      await db.movements.add({
        id: createId(),
        operationId: restoreOperationId,
        productId,
        type: 'unarchive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        note: '復原庫存時解除封存',
        createdAt: now,
      });
    }
  });
  return restoreOperationId;
}

export async function updateProduct(
  productId: string,
  input: { name: string; categoryId: string },
): Promise<void> {
  const normalizedName = normalizeName(input.name);
  if (!normalizedName) throw new Error('請輸入商品名稱');
  await db.transaction('rw', db.products, db.categories, async () => {
    if (input.categoryId && !(await db.categories.get(input.categoryId))) {
      throw new Error('找不到所選分類');
    }
    const duplicate = await db.products.where('normalizedName').equals(normalizedName).first();
    if (duplicate && duplicate.id !== productId) throw new Error('已有相同名稱的商品');
    await db.products.update(productId, {
      name: input.name.trim(),
      normalizedName,
      categoryId: input.categoryId,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function addCustomCategory(name: string): Promise<void> {
  const normalizedName = normalizeName(name);
  if (!normalizedName) throw new Error('請輸入分類名稱');

  const duplicate = await db.categories.where('normalizedName').equals(normalizedName).first();
  if (duplicate) throw new Error('已有相同的分類');

  await db.categories.add({
    id: createId(),
    name: name.trim(),
    normalizedName,
    isDefault: false,
    sortOrder: await db.categories.count(),
    createdAt: new Date().toISOString(),
  });
}

export async function countProductsInCategory(categoryId: string): Promise<number> {
  return db.products.where('categoryId').equals(categoryId).count();
}

export async function deleteCategory(categoryId: string): Promise<number> {
  const category = await db.categories.get(categoryId);
  if (!category) throw new Error('找不到這個分類');

  return db.transaction('rw', db.categories, db.products, async () => {
    const products = await db.products.where('categoryId').equals(categoryId).toArray();
    await Promise.all(
      products.map((product) =>
        db.products.update(product.id, { categoryId: '', updatedAt: new Date().toISOString() }),
      ),
    );
    await db.categories.delete(categoryId);
    return products.length;
  });
}

export async function reorderCategories(categoryIds: string[]): Promise<void> {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(
      categoryIds.map((categoryId, sortOrder) => db.categories.update(categoryId, { sortOrder })),
    );
  });
}
