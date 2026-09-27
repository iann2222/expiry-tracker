import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import * as database from '../data/database';
import { TaipeiClockProvider } from '../context/TaipeiClockContext';
import { db, ensureDatabaseDefaults } from '../data/database';
import { createAppTheme } from '../theme';
import { AddItemPage } from './AddItemPage';

describe('AddItemPage autofill behavior', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('prevents duplicate restocks and lets a failed write be retried', async () => {
    await database.addInventoryBatch({ name: '牛奶', categoryId: '', quantity: 1,
      expiryDate: '2027-01-01', expiryPrecision: 'day' });
    let rejectWrite!: (error: Error) => void;
    const add = vi.spyOn(database, 'addInventoryBatch').mockImplementationOnce(
      () => new Promise<string>((_, reject) => { rejectWrite = reject; }),
    );
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <TaipeiClockProvider>
          <MemoryRouter initialEntries={['/add']}>
            <Routes>
              <Route path="/add" element={<AddItemPage />} />
              <Route path="/inventory" element={<div>已返回庫存</div>} />
            </Routes>
          </MemoryRouter>
        </TaipeiClockProvider>
      </ThemeProvider>,
    );
    fireEvent.change(await screen.findByLabelText('商品名稱'), { target: { value: '牛奶' } });
    fireEvent.click(screen.getByLabelText('有效期限'));
    fireEvent.click(await screen.findByRole('button', { name: '套用' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '套用' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '儲存商品' }));
    const button = await screen.findByRole('button', { name: '加入同一商品' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(add).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    rejectWrite(new Error('測試寫入失敗'));
    expect(await within(screen.getByRole('dialog')).findByText('測試寫入失敗')).toBeInTheDocument();
    expect(await db.batches.count()).toBe(1);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByText('已返回庫存')).toBeInTheDocument();
    expect(await db.batches.count()).toBe(2);
    expect(add).toHaveBeenCalledTimes(2);
  });

  it('disables autofill for editable text and number fields', async () => {
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <TaipeiClockProvider>
          <MemoryRouter initialEntries={['/add']}>
            <AddItemPage />
          </MemoryRouter>
        </TaipeiClockProvider>
      </ThemeProvider>,
    );

    const productInput = await screen.findByLabelText('商品名稱');
    expect(productInput).toHaveAttribute('name', 'name');
    expect(productInput).toHaveAttribute('autocomplete', 'off');
    expect(productInput).not.toHaveAttribute('data-1p-ignore');
    expect(productInput.closest('form')).not.toHaveAttribute('autocomplete');
    expect(screen.getByLabelText('數量')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('備註')).toHaveAttribute('autocomplete', 'off');
  });
});
