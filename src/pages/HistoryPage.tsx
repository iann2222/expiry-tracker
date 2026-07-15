import AddBoxRoundedIcon from '@mui/icons-material/AddBoxRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import { Box, Card, CardContent, Chip, Divider, Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState } from '../components/EmptyState';
import { db } from '../data/database';
import type { MovementType } from '../types';

const movementInfo: Record<
  MovementType,
  { label: string; icon: typeof AddBoxRoundedIcon; color: 'success' | 'warning' | 'default' | 'primary' }
> = {
  add: { label: '新增庫存', icon: AddBoxRoundedIcon, color: 'success' },
  consume: { label: '消耗', icon: RemoveCircleOutlineRoundedIcon, color: 'warning' },
  adjust: { label: '調整', icon: EditRoundedIcon, color: 'primary' },
  restore: { label: '復原', icon: RestoreRoundedIcon, color: 'primary' },
  archive: { label: '封存', icon: ArchiveRoundedIcon, color: 'default' },
  unarchive: { label: '解除封存', icon: RestoreRoundedIcon, color: 'primary' },
};

const dateFormatter = new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function HistoryPage() {
  const history = useLiveQuery(async () => {
    const [movements, products] = await Promise.all([
      db.movements.orderBy('createdAt').reverse().toArray(),
      db.products.toArray(),
    ]);
    const productNames = new Map(products.map((product) => [product.id, product.name]));
    return movements.map((movement) => ({
      ...movement,
      productName: productNames.get(movement.productId) ?? '已移除商品',
    }));
  }, [], []);

  if (history.length === 0) {
    return (
      <EmptyState
        title="還沒有異動紀錄"
        description="新增、消耗、調整與封存等操作會依時間保留在這裡。"
      />
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 2.25 }}>
        <Stack divider={<Divider flexItem />}>
          {history.map((movement) => {
            const info = movementInfo[movement.type];
            const Icon = info.icon;
            return (
              <Stack key={movement.id} direction="row" spacing={1.5} sx={{ py: 1.5 }}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    borderRadius: '14px',
                    color: 'primary.main',
                    bgcolor: 'rgba(130, 169, 149, 0.16)',
                  }}
                >
                  <Icon />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Typography noWrap sx={{ fontWeight: 750 }}>
                      {movement.productName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                      {dateFormatter.format(new Date(movement.createdAt))}
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75 }}>
                    <Chip size="small" label={info.label} color={info.color} variant="outlined" />
                    {movement.change !== 0 && (
                      <Typography variant="body2" sx={{ fontWeight: 750 }}>
                        {movement.change > 0 ? '+' : ''}
                        {movement.change}
                      </Typography>
                    )}
                    {movement.batchId && (
                      <Typography variant="caption" color="text.secondary">
                        {movement.beforeQuantity} → {movement.afterQuantity}
                      </Typography>
                    )}
                  </Stack>
                </Box>
              </Stack>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
