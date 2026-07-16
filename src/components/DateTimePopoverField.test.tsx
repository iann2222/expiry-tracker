import { ThemeProvider } from '@mui/material';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaipeiClockProvider } from '../context/TaipeiClockContext';
import { createAppTheme } from '../theme';
import { DateTimePopoverField } from './DateTimePopoverField';

describe('DateTimePopoverField', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not clamp an imported date outside the default year range', async () => {
    const onDateChange = vi.fn();
    render(
      <ThemeProvider theme={createAppTheme('light')}>
        <TaipeiClockProvider>
          <DateTimePopoverField
            label="有效期限"
            date="2200-01-02"
            onDateChange={onDateChange}
            showWeekday={false}
          />
        </TaipeiClockProvider>
      </ThemeProvider>,
    );

    fireEvent.click(screen.getByLabelText('有效期限'));
    fireEvent.click(await screen.findByRole('button', { name: '套用' }));
    expect(onDateChange).toHaveBeenCalledWith('2200-01-02');
  });
});
