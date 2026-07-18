import { ThemeProvider } from '@mui/material';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
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

  afterEach(() => cleanup());

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
