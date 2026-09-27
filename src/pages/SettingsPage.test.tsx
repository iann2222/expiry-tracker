import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as database from '../data/database';
import { db, ensureDatabaseDefaults } from '../data/database';
import { createAppTheme } from '../theme';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage preference drafts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('blocks repeated category creation and preserves input after failure for retry', async () => {
    let rejectWrite!: (error: Error) => void;
    const create = vi.spyOn(database, 'addCustomCategory').mockImplementationOnce(
      () => new Promise<void>((_, reject) => { rejectWrite = reject; }),
    );
    render(<ThemeProvider theme={createAppTheme('light')}><SettingsPage /></ThemeProvider>);
    const input = await screen.findByLabelText('新的分類名稱');
    fireEvent.change(input, { target: { value: '測試分類' } });
    const button = screen.getByRole('button', { name: '新增分類' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(create).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    rejectWrite(new Error('測試寫入失敗'));
    expect(await screen.findByText('測試寫入失敗')).toBeInTheDocument();
    expect(input).toHaveValue('測試分類');
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(async () => {
      expect(await db.categories.where('normalizedName').equals('測試分類').count()).toBe(1);
    });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('keeps preference drafts after failed storage and allows retry', async () => {
    render(<ThemeProvider theme={createAppTheme('light')}><SettingsPage /></ThemeProvider>);
    const input = await screen.findByLabelText('近期到期門檻');
    fireEvent.change(input, { target: { value: '12' } });
    vi.spyOn(db.preferences, 'put').mockRejectedValueOnce(new Error('儲存空間不足'));
    fireEvent.click(screen.getByRole('button', { name: '儲存效期偏好' }));
    expect(await screen.findByText('儲存空間不足')).toBeInTheDocument();
    expect(input).toHaveValue(12);
    expect((await db.preferences.get('app'))?.urgentDays).toBe(7);
    fireEvent.click(screen.getByRole('button', { name: '儲存效期偏好' }));
    await waitFor(async () => expect((await db.preferences.get('app'))?.urgentDays).toBe(12));
  });

  it('keeps the delete dialog open after failure and allows retry', async () => {
    render(<ThemeProvider theme={createAppTheme('light')}><SettingsPage /></ThemeProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '刪除其他' }));
    const button = await screen.findByRole('button', { name: '刪除分類' });
    await waitFor(() => expect(button).toBeEnabled());
    vi.spyOn(database, 'deleteCategory').mockRejectedValueOnce(new Error('分類刪除失敗'));
    fireEvent.click(button);
    expect(await screen.findByText('分類刪除失敗')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(await db.categories.where('normalizedName').equals('其他').count()).toBe(1);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(async () => expect(await db.categories.where('normalizedName').equals('其他').count()).toBe(0));
  });

  it('keeps unsaved threshold edits when an immediate appearance setting changes', async () => {
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <SettingsPage />
      </ThemeProvider>,
    );

    const urgentInput = await screen.findByLabelText('近期到期門檻');
    expect(urgentInput).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('留意門檻')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('新的分類名稱')).toHaveAttribute('autocomplete', 'off');
    fireEvent.change(urgentInput, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '深色' }));

    await waitFor(async () => {
      expect((await db.preferences.get('app'))?.themeMode).toBe('dark');
    });
    expect(urgentInput).toHaveValue(12);
  });
});
