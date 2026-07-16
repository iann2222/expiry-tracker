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
});
