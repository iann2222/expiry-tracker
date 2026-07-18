import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { TaipeiClockProvider } from '../context/TaipeiClockContext';
import { addInventoryBatch, db, ensureDatabaseDefaults } from '../data/database';
import { createAppTheme } from '../theme';
import { InventoryPage } from './InventoryPage';

function renderPage() {
  return render(
    <ThemeProvider theme={createAppTheme('light')}>
      <TaipeiClockProvider>
        <MemoryRouter initialEntries={['/inventory']}>
          <InventoryPage />
        </MemoryRouter>
      </TaipeiClockProvider>
    </ThemeProvider>,
  );
}

describe('InventoryPage stock operations', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
    await addInventoryBatch({
      name: 'UI 測試食品',
      categoryId: (await db.categories.orderBy('sortOrder').first())?.id ?? '',
      quantity: 1,
      expiryDate: '2026-08-10',
      expiryPrecision: 'day',
    });
  });

  afterEach(() => cleanup());

  it('opens batch details and records a batch-specific discard with a reason', async () => {
    renderPage();
    expect(await screen.findByText('UI 測試食品')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜尋商品')).toHaveAttribute('autocomplete', 'off');

    fireEvent.click(screen.getByRole('button', { name: '查看批次' }));
    expect(await screen.findByText('現有批次（1）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '丟棄' }));

    expect(await screen.findByRole('heading', { name: '丟棄庫存' })).toBeInTheDocument();
    expect(screen.getByLabelText('處理數量')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('丟棄原因（必填）')).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(screen.getByLabelText('丟棄原因（必填）'), {
      target: { value: '測試破損' },
    });
    fireEvent.click(screen.getByRole('button', { name: '丟棄 1 件' }));

    expect(await screen.findByText('已記錄丟棄')).toBeInTheDocument();
    await waitFor(async () => {
      expect((await db.batches.toArray())[0].quantity).toBe(0);
      expect(await db.movements.where('type').equals('discard').count()).toBe(1);
    });
  });

  it('disables autofill in product and batch editing dialogs', async () => {
    renderPage();
    expect(await screen.findByText('UI 測試食品')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '編輯UI 測試食品' }));
    expect(await screen.findByRole('heading', { name: '編輯商品' })).toBeInTheDocument();
    expect(screen.getByLabelText('商品名稱')).toHaveAttribute('autocomplete', 'off');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '編輯商品' })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: '查看批次' }));
    expect(await screen.findByText('現有批次（1）')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '編輯批次' }));

    expect(await screen.findByRole('heading', { name: '編輯批次' })).toBeInTheDocument();
    expect(screen.getByLabelText('盤點後數量')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('批次備註')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('調整原因')).toHaveAttribute('autocomplete', 'off');
  });
});
