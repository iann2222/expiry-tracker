import { Box, Card, CardContent, Stack, Typography, useTheme } from '@mui/material';
import { alpha, darken, lighten } from '@mui/material/styles';
import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: ReactNode;
}) {
  const theme = useTheme();
  const iconColor = theme.palette.mode === 'dark' ? lighten(color, 0.08) : darken(color, 0.24);

  return (
    <Card sx={{ height: '100%', boxShadow: 'none' }}>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography color="text.secondary" variant="caption" sx={{ fontWeight: 700 }}>
              {label}
            </Typography>
            <Typography sx={{ mt: 0.25, fontSize: '1.65rem', lineHeight: 1.2, fontWeight: 800 }}>
              {value}
            </Typography>
          </Box>
          <Box
            sx={{
              width: 40,
              height: 40,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '13px',
              color: iconColor,
              bgcolor: alpha(color, theme.palette.mode === 'dark' ? 0.2 : 0.14),
            }}
          >
            {icon}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}
