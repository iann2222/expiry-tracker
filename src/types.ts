export type ExpiryStatus = 'expired' | 'urgent' | 'soon' | 'safe';
export type ExpiryPrecision = 'day' | 'hour' | 'minute';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface StatusColors {
  expired: string;
  urgent: string;
  soon: string;
  safe: string;
}

export interface AppPreferences {
  id: 'app';
  urgentDays: number;
  soonDays: number;
  colors: StatusColors;
  themeMode: ThemeMode;
  showWeekday: boolean;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  normalizedName: string;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  normalizedName: string;
  categoryId: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Batch {
  id: string;
  productId: string;
  quantity: number;
  initialQuantity: number;
  expiryDate: string;
  expiryTime?: string;
  expiryPrecision: ExpiryPrecision;
  purchaseDate?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type MovementType =
  | 'add'
  | 'consume'
  | 'adjust'
  | 'restore'
  | 'archive'
  | 'unarchive';

export interface StockMovement {
  id: string;
  productId: string;
  batchId?: string;
  type: MovementType;
  change: number;
  beforeQuantity: number;
  afterQuantity: number;
  note?: string;
  createdAt: string;
}

export interface InventoryRow {
  product: Product;
  batches: Batch[];
  totalQuantity: number;
  nearestBatch?: Batch;
}
