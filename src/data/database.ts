import Dexie, { type Table } from 'dexie';
import type {
  AppPreferences,
  Batch,
  Category,
  Product,
  StockMovement,
} from '../types';
import { normalizeName } from '../domain/inventory';
import { expiryEndTimestamp } from '../domain/taipeiTime';
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

export async function ensureDatabaseDefaults(): Promise<void> {
  await db.transaction('rw', db.preferences, db.categories, async () => {
    const preferences = await db.preferences.get('app');
    if (!preferences) {
      await db.preferences.add({
        ...defaultPreferences,
        updatedAt: new Date().toISOString(),
      });
    }

    if ((await db.categories.count()) === 0) {
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
  const now = new Date().toISOString();
  const batchId = createId();

  return db.transaction('rw', db.products, db.batches, db.movements, async () => {
    let product: Product | undefined;

    if (input.existingProductId) {
      product = await db.products.get(input.existingProductId);
    }

    if (!product) {
      product = {
        id: createId(),
        name: input.name.trim(),
        normalizedName: normalizeName(input.name),
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
      expiryTime: input.expiryTime,
      expiryPrecision: input.expiryPrecision,
      purchaseDate: input.purchaseDate || undefined,
      note: input.note?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    await db.batches.add(batch);
    await db.products.update(product.id, { updatedAt: now });
    await db.movements.add({
      id: createId(),
      productId: product.id,
      batchId,
      type: 'add',
      change: input.quantity,
      beforeQuantity: 0,
      afterQuantity: input.quantity,
      createdAt: now,
    });

    return product.id;
  });
}

export async function consumeProduct(
  productId: string,
  amount: number,
  archiveWhenEmpty: boolean,
): Promise<void> {
  if (!Number.isInteger(amount) || amount < 1) throw new Error('扣除數量必須是正整數');
  await db.transaction('rw', db.products, db.batches, db.movements, async () => {
    const batches = (await db.batches.where('productId').equals(productId).toArray())
      .filter((batch) => batch.quantity > 0)
      .sort((left, right) => {
        const byExpiry = expiryEndTimestamp(left) - expiryEndTimestamp(right);
        const byPurchase = (left.purchaseDate ?? '9999-12-31').localeCompare(
          right.purchaseDate ?? '9999-12-31',
        );
        return byExpiry || byPurchase || left.createdAt.localeCompare(right.createdAt);
      });

    const totalQuantity = batches.reduce((sum, batch) => sum + batch.quantity, 0);
    if (amount > totalQuantity) throw new Error('扣除數量不可大於現有庫存');

    const now = new Date().toISOString();
    let remainingToConsume = amount;
    for (const batch of batches) {
      if (remainingToConsume === 0) break;
      const consumed = Math.min(batch.quantity, remainingToConsume);
      const afterQuantity = batch.quantity - consumed;
      await db.batches.update(batch.id, {
        quantity: afterQuantity,
        updatedAt: now,
        completedAt: afterQuantity === 0 ? now : undefined,
      });
      await db.movements.add({
        id: createId(),
        productId,
        batchId: batch.id,
        type: 'consume',
        change: -consumed,
        beforeQuantity: batch.quantity,
        afterQuantity,
        createdAt: now,
      });
      remainingToConsume -= consumed;
    }

    const remainingQuantity = totalQuantity - amount;
    if (remainingQuantity === 0 && archiveWhenEmpty) {
      await db.products.update(productId, { archived: true, updatedAt: now });
      await db.movements.add({
        id: createId(),
        productId,
        type: 'archive',
        change: 0,
        beforeQuantity: 0,
        afterQuantity: 0,
        createdAt: now,
      });
    }
  });
}

export async function setProductArchived(productId: string, archived: boolean): Promise<void> {
  const product = await db.products.get(productId);
  if (!product || product.archived === archived) return;
  const now = new Date().toISOString();
  await db.transaction('rw', db.products, db.movements, async () => {
    await db.products.update(productId, { archived, updatedAt: now });
    await db.movements.add({
      id: createId(),
      productId,
      type: archived ? 'archive' : 'unarchive',
      change: 0,
      beforeQuantity: 0,
      afterQuantity: 0,
      createdAt: now,
    });
  });
}

export async function updateProduct(
  productId: string,
  input: { name: string; categoryId: string },
): Promise<void> {
  const normalizedName = normalizeName(input.name);
  if (!normalizedName) throw new Error('請輸入商品名稱');
  const duplicate = await db.products.where('normalizedName').equals(normalizedName).first();
  if (duplicate && duplicate.id !== productId) throw new Error('已有相同名稱的商品');
  await db.products.update(productId, {
    name: input.name.trim(),
    normalizedName,
    categoryId: input.categoryId,
    updatedAt: new Date().toISOString(),
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
