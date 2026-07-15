import AccessTimeFilledRoundedIcon from '@mui/icons-material/AccessTimeFilledRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import RestaurantRoundedIcon from '@mui/icons-material/RestaurantRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  Typography,
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ExpiryChip } from '../components/ExpiryChip';
import { StatCard } from '../components/StatCard';
import { useTaipeiClock } from '../context/TaipeiClockContext';
import { getExpiryStatus, getStatusLabel } from '../domain/inventory';
import { expiryEndTimestamp, formatExpiryValue } from '../domain/taipeiTime';
import { useInventoryRows, usePreferences } from '../hooks/useAppData';

export function HomePage() {
  const navigate = useNavigate();
  const { now } = useTaipeiClock();
  const preferences = usePreferences();
  const rows = useInventoryRows();
  const entries = rows.flatMap((row) =>
    row.batches.map((batch) => ({ product: row.product, batch })),
  );

  const totalQuantity = entries.reduce((sum, entry) => sum + entry.batch.quantity, 0);
  const quantityByStatus = entries.reduce(
    (totals, entry) => {
      totals[getExpiryStatus(entry.batch, preferences, now)] += entry.batch.quantity;
      return totals;
    },
    { expired: 0, urgent: 0, soon: 0, safe: 0 },
  );

  const priorityEntries = entries
    .filter((entry) => getExpiryStatus(entry.batch, preferences, now) !== 'expired')
    .sort((left, right) => expiryEndTimestamp(left.batch) - expiryEndTimestamp(right.batch))
    .slice(0, 4);
  const expiredEntries = entries
    .filter((entry) => getExpiryStatus(entry.batch, preferences, now) === 'expired')
    .sort((left, right) => expiryEndTimestamp(left.batch) - expiryEndTimestamp(right.batch))
    .slice(0, 3);

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h1">把快到期的，放在最前面。</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          庫存會依你設定的效期門檻自動整理。
        </Typography>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.5 }}>
        <StatCard
          label="庫存總數"
          value={totalQuantity}
          color="#1F6657"
          icon={<Inventory2RoundedIcon />}
        />
        <StatCard
          label="已過期"
          value={quantityByStatus.expired}
          color={preferences.colors.expired}
          icon={<ErrorRoundedIcon />}
        />
        <StatCard
          label={getStatusLabel('urgent', preferences)}
          value={quantityByStatus.urgent}
          color={preferences.colors.urgent}
          icon={<AccessTimeFilledRoundedIcon />}
        />
        <StatCard
          label={getStatusLabel('soon', preferences)}
          value={quantityByStatus.soon}
          color={preferences.colors.soon}
          icon={<WarningAmberRoundedIcon />}
        />
      </Box>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Card>
            <CardContent sx={{ p: 2.25 }}>
              <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <RestaurantRoundedIcon color="primary" />
                  <Typography variant="h2">建議優先處理</Typography>
                </Stack>
                <Button size="small" onClick={() => navigate('/inventory')}>
                  查看全部
                </Button>
              </Stack>
              {priorityEntries.length === 0 ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
                  <CheckCircleRoundedIcon color="success" />
                  <Typography variant="body2">目前沒有尚未過期的庫存。</Typography>
                </Stack>
              ) : (
                <Stack divider={<Divider flexItem />}>
                  {priorityEntries.map(({ product, batch }) => (
                    <Stack
                      key={batch.id}
                      direction="row"
                      spacing={1.5}
                      sx={{ py: 1.35, alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap sx={{ fontWeight: 750 }}>
                          {product.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          數量 {batch.quantity} · {formatExpiryValue(batch, preferences.showWeekday)}
                        </Typography>
                      </Box>
                      <ExpiryChip batch={batch} preferences={preferences} />
                    </Stack>
                  ))}
                </Stack>
              )}
            </CardContent>
          </Card>

          {expiredEntries.length > 0 && (
            <Card sx={{ borderColor: preferences.colors.expired }}>
              <CardContent sx={{ p: 2.25 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                  <ErrorRoundedIcon sx={{ color: preferences.colors.expired }} />
                  <Box>
                    <Typography variant="h2">已過期品項</Typography>
                    <Typography variant="caption" color="text.secondary">
                      請盡速檢查並處理這些品項。
                    </Typography>
                  </Box>
                </Stack>
                <Stack divider={<Divider flexItem />}>
                  {expiredEntries.map(({ product, batch }) => (
                    <Stack
                      key={batch.id}
                      direction="row"
                      spacing={1}
                      sx={{ py: 1.2, alignItems: 'center', justifyContent: 'space-between' }}
                    >
                      <Typography sx={{ fontWeight: 750 }}>{product.name}</Typography>
                      <ExpiryChip batch={batch} preferences={preferences} />
                    </Stack>
                  ))}
                </Stack>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </Stack>
  );
}
