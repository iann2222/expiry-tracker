import { Box, Chip, useTheme } from '@mui/material';
import { alpha, darken, lighten } from '@mui/material/styles';
import { useTaipeiClock } from '../context/TaipeiClockContext';
import { formatRelativeExpiry, getExpiryStatus } from '../domain/inventory';
import type { AppPreferences, Batch } from '../types';

export function ExpiryChip({
  batch,
  preferences,
}: {
  batch: Pick<Batch, 'expiryDate' | 'expiryTime' | 'expiryPrecision'>;
  preferences: AppPreferences;
}) {
  const { now } = useTaipeiClock();
  const theme = useTheme();
  const status = getExpiryStatus(batch, preferences, now);
  const color = preferences.colors[status];
  const textColor = theme.palette.mode === 'dark' ? lighten(color, 0.08) : darken(color, 0.28);

  return (
    <Chip
      size="small"
      label={formatRelativeExpiry(batch, now)}
      icon={<Box component="span" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />}
      sx={{
        color: textColor,
        bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.2 : 0.14),
        '& .MuiChip-icon': { ml: 1 },
      }}
    />
  );
}
