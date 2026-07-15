import { z } from 'zod';
import { db, defaultPreferences, ensureDatabaseDefaults } from './database';
import { getTaipeiToday } from '../domain/taipeiTime';

const statusColorsSchema = z.object({
  expired: z.string().regex(/^#[0-9a-f]{6}$/i),
  urgent: z.string().regex(/^#[0-9a-f]{6}$/i),
  soon: z.string().regex(/^#[0-9a-f]{6}$/i),
  safe: z.string().regex(/^#[0-9a-f]{6}$/i),
});

const preferencesSchema = z.object({
  id: z.literal('app'),
  urgentDays: z.number().int().min(0),
  soonDays: z.number().int().positive(),
  colors: statusColorsSchema,
  themeMode: z.enum(['light', 'dark', 'system']).default(defaultPreferences.themeMode),
  showWeekday: z.boolean().default(defaultPreferences.showWeekday),
  updatedAt: z.string(),
});

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalizedName: z.string(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().min(0),
  createdAt: z.string(),
});

const productSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  normalizedName: z.string(),
  categoryId: z.string(),
  archived: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const batchSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.number().int().min(0),
  initialQuantity: z.number().int().min(0),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expiryTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  expiryPrecision: z.enum(['day', 'hour', 'minute']).default('day'),
  purchaseDate: z.string().optional(),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().optional(),
});

const movementSchema = z.object({
  id: z.string().min(1),
  productId: z.string().min(1),
  batchId: z.string().optional(),
  type: z.enum(['add', 'consume', 'adjust', 'restore', 'archive', 'unarchive']),
  change: z.number().int(),
  beforeQuantity: z.number().int().min(0),
  afterQuantity: z.number().int().min(0),
  note: z.string().optional(),
  createdAt: z.string(),
});

const backupSchema = z.object({
  app: z.literal('expiry-tracker'),
  schemaVersion: z.number().int().min(1).max(2),
  exportedAt: z.string(),
  data: z.object({
    preferences: preferencesSchema,
    categories: z.array(categorySchema),
    products: z.array(productSchema),
    batches: z.array(batchSchema),
    movements: z.array(movementSchema),
  }),
});

export type BackupPayload = z.infer<typeof backupSchema>;

export async function createBackup(): Promise<BackupPayload> {
  const [preferences, categories, products, batches, movements] = await Promise.all([
    db.preferences.get('app'),
    db.categories.orderBy('sortOrder').toArray(),
    db.products.toArray(),
    db.batches.toArray(),
    db.movements.toArray(),
  ]);

  return backupSchema.parse({
    app: 'expiry-tracker',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    data: {
      preferences: preferences ?? defaultPreferences,
      categories,
      products,
      batches,
      movements,
    },
  });
}

export async function downloadBackup(): Promise<void> {
  const payload = await createBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `expiry-tracker-backup-${getTaipeiToday()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function parseBackupFile(file: File): Promise<BackupPayload> {
  if (file.size > 10 * 1024 * 1024) throw new Error('備份檔不可超過 10 MB');
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('這不是有效的 JSON 檔案');
  }

  const result = backupSchema.safeParse(value);
  if (!result.success) throw new Error('備份格式不正確或缺少必要資料');
  return result.data;
}

export async function restoreBackup(payload: BackupPayload): Promise<void> {
  const parsed = backupSchema.parse(payload);
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
  await ensureDatabaseDefaults();
}
