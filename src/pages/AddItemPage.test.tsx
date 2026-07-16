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

  it('does not expose the product field as a credential input', async () => {
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
    expect(productInput).toHaveAttribute('name', 'itemLabel');
    expect(productInput).toHaveAttribute('autocomplete', 'off');
    expect(productInput).toHaveAttribute('data-1p-ignore', 'true');
    expect(productInput.closest('form')).toHaveAttribute('autocomplete', 'off');
  });
});
