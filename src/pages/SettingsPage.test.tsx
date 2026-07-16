import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, ensureDatabaseDefaults } from '../data/database';
import { createAppTheme } from '../theme';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage preference drafts', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureDatabaseDefaults();
  });

  afterEach(() => cleanup());

  it('keeps unsaved threshold edits when an immediate appearance setting changes', async () => {
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <SettingsPage />
      </ThemeProvider>,
    );

    const urgentInput = await screen.findByLabelText('近期到期門檻');
    fireEvent.change(urgentInput, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: '深色' }));

    await waitFor(async () => {
      expect((await db.preferences.get('app'))?.themeMode).toBe('dark');
    });
    expect(urgentInput).toHaveValue(12);
  });
});
