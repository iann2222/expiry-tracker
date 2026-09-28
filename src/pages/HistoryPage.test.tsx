import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import {
  addInventoryBatch,
  consumeProduct,
  db,
  ensureDatabaseDefaults,
} from '../data/database';
import { createAppTheme } from '../theme';
import { HistoryPage } from './HistoryPage';

describe('HistoryPage restore flow', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
    const productId = await addInventoryBatch({
      name: '可復原食品',
      categoryId: (await db.categories.orderBy('sortOrder').first())?.id ?? '',
      quantity: 2,
      expiryDate: '2026-08-10',
      expiryPrecision: 'day',
    });
    await consumeProduct(productId, 1, false);
  });

  afterEach(() => cleanup());

  it('paginates whole operations and resets pagination when searching', async () => {
    const product = (await db.products.toArray())[0];
    for (let i = 0; i < 22; i++) {
      await addInventoryBatch({ name: product.name, existingProductId: product.id,
        categoryId: product.categoryId, quantity: 1, expiryDate: '2027-01-01', expiryPrecision: 'day' });
    }
    render(<ThemeProvider theme={createAppTheme('light')}><MemoryRouter><HistoryPage /></MemoryRouter></ThemeProvider>);
    expect(await screen.findByText('第 1 / 2 頁')).toBeInTheDocument();
    expect(screen.getAllByText('可復原食品')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
    expect(screen.getAllByText('可復原食品')).toHaveLength(4);
    fireEvent.change(screen.getByLabelText('搜尋歷史商品'), { target: { value: '不存在' } });
    expect(screen.getByText('找不到符合條件的異動紀錄')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '清除查詢條件' }));
    expect(screen.getByText('第 1 / 2 頁')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('異動類型'), { target: { value: 'consume' } });
    expect(screen.getAllByText('可復原食品')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '復原' })).toBeInTheDocument();
  });

  it('filters inclusive Taipei dates and reports reversed ranges', async () => {
    await db.movements.toCollection().modify({ createdAt: '2026-09-27T16:00:00.000Z' });
    render(<ThemeProvider theme={createAppTheme('light')}><MemoryRouter><HistoryPage /></MemoryRouter></ThemeProvider>);
    const start = await screen.findByLabelText('開始日期');
    fireEvent.change(start, { target: { value: '2026-09-28' } });
    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-09-28' } });
    expect(screen.getAllByText('可復原食品')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('結束日期'), { target: { value: '2026-09-27' } });
    expect(screen.getByText('開始日期不可晚於結束日期')).toBeInTheDocument();
    fireEvent.change(start, { target: { value: '2026-09-27' } });
    expect(screen.getByText('找不到符合條件的異動紀錄')).toBeInTheDocument();
  });

  it('restores the latest operation while keeping the audit trail', async () => {
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <MemoryRouter>
          <HistoryPage />
        </MemoryRouter>
      </ThemeProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: '復原' }));
    expect(await screen.findByText(/建立一筆反向異動/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '確認復原' }));

    expect(await screen.findByText('異動已復原，原紀錄仍保留在歷史中')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.batches.toArray())[0].quantity).toBe(2);
      expect(await db.movements.where('type').equals('restore').count()).toBe(1);
      expect(await db.movements.where('type').equals('consume').count()).toBe(1);
    });
    fireEvent.change(screen.getByLabelText('異動類型'), { target: { value: 'consume' } });
    expect(await screen.findByText('已復原')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '復原' })).not.toBeInTheDocument();
  });
});
