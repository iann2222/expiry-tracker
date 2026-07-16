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
  });
});
