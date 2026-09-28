import AddBoxRoundedIcon from '@mui/icons-material/AddBoxRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState } from 'react';
import { EmptyState } from '../components/EmptyState';
import { db, restoreStockOperation } from '../data/database';
import {
  getPrimaryMovement,
  getRestorableOperationIds,
  groupMovements,
} from '../domain/movements';
import { formatExpiryValue, getTaipeiToday } from '../domain/taipeiTime';
import { normalizeName } from '../domain/inventory';
import type { MovementType, StockMovement } from '../types';

const movementInfo: Record<
  MovementType,
  {
    label: string;
    icon: typeof AddBoxRoundedIcon;
    color: 'success' | 'warning' | 'error' | 'default' | 'primary';
  }
> = {
  add: { label: '新增庫存', icon: AddBoxRoundedIcon, color: 'success' },
  consume: { label: '消耗', icon: RemoveCircleOutlineRoundedIcon, color: 'warning' },
  discard: { label: '丟棄', icon: DeleteOutlineRoundedIcon, color: 'error' },
  adjust: { label: '盤點調整', icon: EditRoundedIcon, color: 'primary' },
  restore: { label: '復原異動', icon: RestoreRoundedIcon, color: 'primary' },
  archive: { label: '封存', icon: ArchiveRoundedIcon, color: 'default' },
  unarchive: { label: '解除封存', icon: RestoreRoundedIcon, color: 'primary' },
};

const reversibleTypes = new Set<MovementType>(['consume', 'discard', 'adjust']);

const dateFormatter = new Intl.DateTimeFormat('zh-TW', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Taipei',
});

interface RestoreTarget {
  movementId: string;
  productName: string;
  label: string;
}

export function HistoryPage() {
  const data = useLiveQuery(
    async () => {
      const [movements, products, batches] = await Promise.all([
        db.movements.orderBy('createdAt').reverse().toArray(),
        db.products.toArray(),
        db.batches.toArray(),
      ]);
      return { movements, products, batches };
    },
    [],
    { movements: [], products: [], batches: [] },
  );
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const restoringRef = useRef(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);

  const productNames = new Map(data.products.map((product) => [product.id, product.name]));
  const batchesById = new Map(data.batches.map((batch) => [batch.id, batch]));
  const groups = groupMovements(data.movements);
  const restorableOperationIds = getRestorableOperationIds(data.movements, data.batches);
  const restoredIds = new Set(data.movements.map((movement) => movement.revertsMovementId).filter(Boolean));
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);
  const filtered = groups.filter((group) => {
    if (invalidRange) return false;
    const primary = getPrimaryMovement(group);
    const name = productNames.get(primary.productId) ?? '已移除商品';
    const day = getTaipeiToday(new Date(primary.createdAt));
    return normalizeName(name).includes(normalizeName(query)) &&
      (typeFilter === 'all' || primary.type === typeFilter) &&
      (!startDate || day >= startDate) && (!endDate || day <= endDate);
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pageCount);
  const visibleGroups = filtered.slice((currentPage - 1) * 20, currentPage * 20);

  async function confirmRestore() {
    if (!restoreTarget || restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    setRestoreError('');
    try {
      await restoreStockOperation(restoreTarget.movementId);
      setRestoreTarget(null);
      setMessage('異動已復原，原紀錄仍保留在歷史中');
    } catch (error) {
      setRestoreError(error instanceof Error ? error.message : '無法復原這筆異動');
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="還沒有異動紀錄"
        description="新增、消耗、丟棄、盤點與封存等操作會依時間保留在這裡。"
      />
    );
  }

  return (
    <>
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        <TextField label="搜尋歷史商品" autoComplete="off" value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
        <TextField select label="異動類型" value={typeFilter} slotProps={{ select: { native: true } }}
          onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
          <option value="all">全部類型</option>
          {Object.entries(movementInfo).map(([type, info]) => <option key={type} value={type}>{info.label}</option>)}
        </TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField fullWidth label="開始日期" type="date" autoComplete="off" value={startDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => { setStartDate(event.target.value); setPage(1); }} />
          <TextField fullWidth label="結束日期" type="date" autoComplete="off" value={endDate}
            slotProps={{ inputLabel: { shrink: true } }}
            onChange={(event) => { setEndDate(event.target.value); setPage(1); }} />
        </Stack>
        <Typography variant="caption">日期依台北時間，包含起訖當日；共 {filtered.length} 筆操作</Typography>
        {invalidRange && <Alert severity="warning">開始日期不可晚於結束日期</Alert>}
        <Button onClick={() => { setQuery(''); setTypeFilter('all'); setStartDate(''); setEndDate(''); setPage(1); }}>清除查詢條件</Button>
      </Stack>
      {filtered.length === 0 && <Alert severity="info">找不到符合條件的異動紀錄</Alert>}
      <Card>
        <CardContent sx={{ p: 2.25 }}>
          <Stack divider={<Divider flexItem />}>
            {visibleGroups.map((group) => {
              const primary = getPrimaryMovement(group);
              const info = movementInfo[primary.type];
              const Icon = info.icon;
              const productName = productNames.get(primary.productId) ?? '已移除商品';
              const batchMovements = group.movements.filter(
                (movement): movement is StockMovement & { batchId: string } =>
                  Boolean(movement.batchId),
              );
              const totalChange = batchMovements.reduce(
                (sum, movement) => sum + movement.change,
                0,
              );
              const reversibleMovement = group.movements.find((movement) =>
                reversibleTypes.has(movement.type),
              );
              const canRestore =
                Boolean(reversibleMovement) && restorableOperationIds.has(group.id);
              const wasRestored =
                Boolean(reversibleMovement) &&
                group.movements.some((source) => restoredIds.has(source.id));
              const note =
                primary.note ??
                group.movements.find((movement) => movement.note)?.note;

              return (
                <Stack key={group.id} direction="row" spacing={1.5} sx={{ py: 1.75 }}>
                  <Box
                    sx={{
                      width: 42,
                      height: 42,
                      display: 'grid',
                      placeItems: 'center',
                      flexShrink: 0,
                      borderRadius: '14px',
                      color: primary.type === 'discard' ? 'error.main' : 'primary.main',
                      bgcolor:
                        primary.type === 'discard'
                          ? 'rgba(240, 116, 125, 0.14)'
                          : 'rgba(130, 169, 149, 0.16)',
                    }}
                  >
                    <Icon />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
                      <Typography noWrap sx={{ fontWeight: 750 }}>
                        {productName}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ flexShrink: 0 }}
                      >
                        {dateFormatter.format(new Date(primary.createdAt))}
                      </Typography>
                    </Stack>
                    <Stack
                      direction="row"
                      spacing={1}
                      useFlexGap
                      sx={{ alignItems: 'center', mt: 0.75, flexWrap: 'wrap' }}
                    >
                      <Chip size="small" label={info.label} color={info.color} variant="outlined" />
                      {totalChange !== 0 && (
                        <Typography variant="body2" sx={{ fontWeight: 750 }}>
                          {totalChange > 0 ? '+' : ''}
                          {totalChange}
                        </Typography>
                      )}
                      {batchMovements.length > 1 && (
                        <Typography variant="caption" color="text.secondary">
                          {batchMovements.length} 個批次
                        </Typography>
                      )}
                    </Stack>
                    {note && (
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.8, whiteSpace: 'pre-wrap' }}
                      >
                        {note}
                      </Typography>
                    )}
                    {batchMovements.length > 0 && (
                      <Stack spacing={0.4} sx={{ mt: 1 }}>
                        {batchMovements.map((movement) => {
                          const batch = batchesById.get(movement.batchId);
                          const expirySource =
                            movement.batchAfter ?? movement.batchBefore ?? batch;
                          return (
                            <Typography
                              key={movement.id}
                              variant="caption"
                              color="text.secondary"
                            >
                              {expirySource
                                ? formatExpiryValue(expirySource, false)
                                : '批次已移除'}{' '}
                              · {movement.beforeQuantity} → {movement.afterQuantity}
                            </Typography>
                          );
                        })}
                      </Stack>
                    )}
                    {reversibleMovement && (
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center', mt: 1 }}
                      >
                        {canRestore ? (
                          <Button
                            size="small"
                            startIcon={<RestoreRoundedIcon />}
                            onClick={() => {
                              setRestoreError('');
                              setRestoreTarget({
                                movementId: reversibleMovement.id,
                                productName,
                                label: info.label,
                              });
                            }}
                          >
                            復原
                          </Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            {wasRestored
                              ? '已復原'
                              : '已有後續異動；如需更正，請至批次詳情進行盤點。'}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Box>
                </Stack>
              );
            })}
          </Stack>
        </CardContent>
      </Card>
      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center', justifyContent: 'center' }}>
        <Button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一頁</Button>
        <Typography>第 {currentPage} / {pageCount} 頁</Typography>
        <Button disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一頁</Button>
      </Stack>

      <Dialog
        open={Boolean(restoreTarget)}
        onClose={() => !restoringRef.current && setRestoreTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>復原「{restoreTarget?.label}」？</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5}>
            {restoreError && <Alert severity="error">{restoreError}</Alert>}
            <Typography>
              將為「{restoreTarget?.productName}」建立一筆反向異動；原紀錄不會被刪除。
            </Typography>
            <Typography variant="body2" color="text.secondary">
              若批次之後已有其他操作，系統會拒絕復原，避免覆蓋較新的庫存狀態。
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button disabled={restoring} onClick={() => setRestoreTarget(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={restoring}
            onClick={() => void confirmRestore()}
          >
            確認復原
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={3000}
        message={message}
        onClose={() => setMessage(null)}
      />
    </>
  );
}
