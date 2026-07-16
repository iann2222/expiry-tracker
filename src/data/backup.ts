import { z } from 'zod';
import { normalizeName } from '../domain/inventory';
import { getTaipeiToday, parseIsoDate, toIsoDate } from '../domain/taipeiTime';
import { db, defaultPreferences } from './database';

const isoDateSchema = z.string().refine((value) => {
  const parts = parseIsoDate(value);
  return Boolean(parts && toIsoDate(parts) === value);
});
const isoTimeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const timestampSchema = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const safeIntegerSchema = z.number().int().refine(Number.isSafeInteger);
const nonNegativeSafeIntegerSchema = z
  .number()
  .int()
  .min(0)
  .refine(Number.isSafeInteger);
const positiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .refine(Number.isSafeInteger);

const statusColorsSchema = z.object({
  expired: z.string().regex(/^#[0-9a-f]{6}$/i),
  urgent: z.string().regex(/^#[0-9a-f]{6}$/i),
  soon: z.string().regex(/^#[0-9a-f]{6}$/i),
  safe: z.string().regex(/^#[0-9a-f]{6}$/i),
});

const preferencesSchema = z
  .object({
    id: z.literal('app'),
    urgentDays: nonNegativeSafeIntegerSchema,
    soonDays: positiveSafeIntegerSchema,
    colors: statusColorsSchema,
    themeMode: z.enum(['light', 'dark', 'system']).default(defaultPreferences.themeMode),
    showWeekday: z.boolean().default(defaultPreferences.showWeekday),
    updatedAt: timestampSchema,
  })
  .refine((preferences) => preferences.soonDays > preferences.urgentDays);

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  normalizedName: z.string(),
  isDefault: z.boolean(),
  sortOrder: nonNegativeSafeIntegerSchema,
  createdAt: timestampSchema,
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  normalizedName: z.string(),
  categoryId: z.string(),
  archived: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});

const batchSnapshotSchema = z
  .object({
    quantity: nonNegativeSafeIntegerSchema,
    expiryDate: isoDateSchema,
    expiryTime: isoTimeSchema.optional(),
    expiryPrecision: z.enum(['day', 'hour', 'minute']).default('day'),
    purchaseDate: isoDateSchema.optional(),
    note: z.string().optional(),
    completedAt: timestampSchema.optional(),
  })
  .refine(
    (snapshot) => snapshot.expiryPrecision === 'day' || Boolean(snapshot.expiryTime),
  );

const batchSchema = z
  .object({
    id: z.string().min(1),
    productId: z.string().min(1),
    quantity: nonNegativeSafeIntegerSchema,
    initialQuantity: nonNegativeSafeIntegerSchema,
    expiryDate: isoDateSchema,
    expiryTime: isoTimeSchema.optional(),
    expiryPrecision: z.enum(['day', 'hour', 'minute']).default('day'),
    purchaseDate: isoDateSchema.optional(),
    note: z.string().optional(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    completedAt: timestampSchema.optional(),
  })
  .refine((batch) => batch.expiryPrecision === 'day' || Boolean(batch.expiryTime));

const movementSchema = z.object({
  id: z.string().min(1),
  operationId: z.string().min(1).optional(),
  productId: z.string().min(1),
  batchId: z.string().optional(),
  type: z.enum(['add', 'consume', 'discard', 'adjust', 'restore', 'archive', 'unarchive']),
  change: safeIntegerSchema,
  beforeQuantity: nonNegativeSafeIntegerSchema,
  afterQuantity: nonNegativeSafeIntegerSchema,
  note: z.string().optional(),
  revertsMovementId: z.string().min(1).optional(),
  batchBefore: batchSnapshotSchema.optional(),
  batchAfter: batchSnapshotSchema.optional(),
  createdAt: timestampSchema,
});

const backupSchema = z.object({
  app: z.literal('expiry-tracker'),
  schemaVersion: z.number().int().min(1).max(3),
  exportedAt: timestampSchema,
  data: z.object({
    preferences: preferencesSchema,
    categories: z.array(categorySchema),
    products: z.array(productSchema),
    batches: z.array(batchSchema),
    movements: z.array(movementSchema),
  }),
});

export type BackupPayload = z.infer<typeof backupSchema>;

function findDuplicate<T>(items: T[], getValue: (item: T) => string): string | undefined {
  const values = new Set<string>();
  for (const item of items) {
    const value = getValue(item);
    if (values.has(value)) return value;
    values.add(value);
  }
  return undefined;
}

function normalizeBackupPayload(payload: BackupPayload): BackupPayload {
  const positiveProductIds = new Set(
    payload.data.batches.filter((batch) => batch.quantity > 0).map((batch) => batch.productId),
  );
  return {
    ...payload,
    data: {
      ...payload.data,
      categories: payload.data.categories.map((category) => ({
        ...category,
        name: category.name.trim(),
        normalizedName: normalizeName(category.name),
      })),
      products: payload.data.products.map((product) => ({
        ...product,
        name: product.name.trim(),
        normalizedName: normalizeName(product.name),
        archived: positiveProductIds.has(product.id) ? false : product.archived,
      })),
      batches: payload.data.batches.map((batch) => ({
        ...batch,
        completedAt: batch.quantity > 0 ? undefined : batch.completedAt,
      })),
      movements: payload.data.movements.map((movement) => ({
        ...movement,
        operationId: movement.operationId ?? movement.id,
      })),
    },
  };
}

function validateBackupConsistency(payload: BackupPayload): void {
  const { categories, products, batches, movements } = payload.data;
  const errors: string[] = [];

  if (findDuplicate(categories, (category) => category.id)) errors.push('分類 ID 重複');
  if (findDuplicate(products, (product) => product.id)) errors.push('商品 ID 重複');
  if (findDuplicate(batches, (batch) => batch.id)) errors.push('批次 ID 重複');
  if (findDuplicate(movements, (movement) => movement.id)) errors.push('異動 ID 重複');

  const categoryIds = new Set(categories.map((category) => category.id));
  const productsById = new Map(products.map((product) => [product.id, product]));
  const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
  const movementsById = new Map(movements.map((movement) => [movement.id, movement]));

  for (const product of products) {
    if (product.categoryId && !categoryIds.has(product.categoryId)) {
      errors.push(`商品「${product.name}」參照不存在的分類`);
    }
  }

  for (const batch of batches) {
    if (!productsById.has(batch.productId)) {
      errors.push(`批次 ${batch.id} 參照不存在的商品`);
    }
  }

  if (
    payload.schemaVersion < 3 &&
    movements.some(
      (movement) =>
        movement.type === 'discard' ||
        movement.revertsMovementId ||
        movement.batchBefore ||
        movement.batchAfter,
    )
  ) {
    errors.push('舊版備份包含新版異動欄位');
  }

  const revertedMovementIds = new Set<string>();
  for (const movement of movements) {
    if (payload.schemaVersion >= 3 && !productsById.has(movement.productId)) {
      errors.push(`異動 ${movement.id} 參照不存在的商品`);
    }
    if (movement.change !== movement.afterQuantity - movement.beforeQuantity) {
      errors.push(`異動 ${movement.id} 的數量計算不一致`);
    }
    if (
      (movement.type === 'add' && movement.change <= 0) ||
      ((movement.type === 'consume' || movement.type === 'discard') && movement.change >= 0)
    ) {
      errors.push(`異動 ${movement.id} 的類型與數量方向不一致`);
    }
    if (movement.type === 'add' && movement.beforeQuantity !== 0) {
      errors.push(`異動 ${movement.id} 的新增數量不正確`);
    }
    if (
      ['add', 'consume', 'discard', 'adjust', 'restore'].includes(movement.type) &&
      !movement.batchId
    ) {
      errors.push(`異動 ${movement.id} 缺少批次`);
    }
    if (
      (movement.type === 'archive' || movement.type === 'unarchive') &&
      (movement.batchId ||
        movement.change !== 0 ||
        movement.beforeQuantity !== 0 ||
        movement.afterQuantity !== 0)
    ) {
      errors.push(`異動 ${movement.id} 的封存資料不正確`);
    }

    const batch = movement.batchId ? batchesById.get(movement.batchId) : undefined;
    if (payload.schemaVersion >= 3 && movement.batchId && !batch) {
      errors.push(`異動 ${movement.id} 參照不存在的批次`);
    }
    if (batch && batch.productId !== movement.productId) {
      errors.push(`異動 ${movement.id} 的商品與批次不一致`);
    }
    if (movement.batchBefore && movement.batchBefore.quantity !== movement.beforeQuantity) {
      errors.push(`異動 ${movement.id} 的變更前快照不一致`);
    }
    if (movement.batchAfter && movement.batchAfter.quantity !== movement.afterQuantity) {
      errors.push(`異動 ${movement.id} 的變更後快照不一致`);
    }
    if (movement.revertsMovementId) {
      const original = movementsById.get(movement.revertsMovementId);
      if (payload.schemaVersion >= 3 && !original) {
        errors.push(`異動 ${movement.id} 參照不存在的原始異動`);
      }
      if (
        movement.revertsMovementId === movement.id ||
        revertedMovementIds.has(movement.revertsMovementId)
      ) {
        errors.push(`異動 ${movement.id} 的復原關聯重複`);
      }
      revertedMovementIds.add(movement.revertsMovementId);
      if (movement.type !== 'restore') {
        errors.push(`異動 ${movement.id} 的復原類型不正確`);
      }
      if (
        original &&
        (original.productId !== movement.productId ||
          original.batchId !== movement.batchId ||
          !['consume', 'discard', 'adjust'].includes(original.type))
      ) {
        errors.push(`異動 ${movement.id} 的復原關聯不一致`);
      }
    }
  }

  const operationGroups = new Map<string, typeof movements>();
  for (const movement of movements) {
    const group = operationGroups.get(movement.operationId!);
    if (group) group.push(movement);
    else operationGroups.set(movement.operationId!, [movement]);
  }
  for (const [operationId, group] of operationGroups) {
    const batchMovements = group.filter((movement) =>
      ['add', 'consume', 'discard', 'adjust', 'restore'].includes(movement.type),
    );
    const batchIds = batchMovements.map((movement) => movement.batchId!);
    const primaryTypes = new Set(batchMovements.map((movement) => movement.type));
    if (
      new Set(group.map((movement) => movement.productId)).size !== 1 ||
      new Set(group.map((movement) => movement.createdAt)).size !== 1 ||
      primaryTypes.size > 1 ||
      new Set(batchIds).size !== batchIds.length ||
      (batchMovements.length > 1 &&
        batchMovements[0]?.type !== 'consume' &&
        batchMovements[0]?.type !== 'restore')
    ) {
      errors.push(`操作 ${operationId} 的異動分組不一致`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`備份資料不一致：${errors.slice(0, 3).join('；')}`);
  }
}

function prepareBackupPayload(value: unknown): BackupPayload {
  const parsed = backupSchema.parse(value);
  const normalized = normalizeBackupPayload(parsed);
  validateBackupConsistency(normalized);
  return normalized;
}

export async function createBackup(): Promise<BackupPayload> {
  const data = await db.transaction(
    'r',
    db.preferences,
    db.categories,
    db.products,
    db.batches,
    db.movements,
    async () => {
      const [preferences, categories, products, batches, movements] = await Promise.all([
        db.preferences.get('app'),
        db.categories.orderBy('sortOrder').toArray(),
        db.products.toArray(),
        db.batches.toArray(),
        db.movements.toArray(),
      ]);
      return {
        preferences: preferences ?? defaultPreferences,
        categories,
        products,
        batches,
        movements,
      };
    },
  );

  return prepareBackupPayload({
    app: 'expiry-tracker',
    schemaVersion: 3,
    exportedAt: new Date().toISOString(),
    data,
  });
}

export async function downloadBackup(): Promise<void> {
  const payload = await createBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expiry-tracker-backup-${getTaipeiToday()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function parseBackupFile(file: File): Promise<BackupPayload> {
  if (file.size > 10 * 1024 * 1024) throw new Error('備份檔不可超過 10 MB');
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('這不是有效的 JSON 檔案');
  }

  try {
    return prepareBackupPayload(value);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('備份資料不一致：')) throw error;
    throw new Error('備份格式不正確、版本不支援或缺少必要資料');
  }
}

export async function restoreBackup(payload: unknown): Promise<void> {
  const parsed = prepareBackupPayload(payload);
  await db.transaction(
    'rw',
    db.preferences,
    db.categories,
    db.products,
    db.batches,
    db.movements,
    async () => {
      await Promise.all([
        db.preferences.clear(),
        db.categories.clear(),
        db.products.clear(),
        db.batches.clear(),
        db.movements.clear(),
      ]);
      await db.preferences.add(parsed.data.preferences);
      if (parsed.data.categories.length) await db.categories.bulkAdd(parsed.data.categories);
      if (parsed.data.products.length) await db.products.bulkAdd(parsed.data.products);
      if (parsed.data.batches.length) await db.batches.bulkAdd(parsed.data.batches);
      if (parsed.data.movements.length) await db.movements.bulkAdd(parsed.data.movements);
    },
  );
}
