import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmptyState } from '../components/EmptyState';
import { ExpiryChip } from '../components/ExpiryChip';
import { useTaipeiClock } from '../context/TaipeiClockContext';
import { consumeProduct, setProductArchived, updateProduct } from '../data/database';
import { getExpiryStatus, getStatusLabel, normalizeName } from '../domain/inventory';
import { formatExpiryValue } from '../domain/taipeiTime';
import {
  useArchivedProducts,
  useCategories,
  useInventoryRows,
  usePreferences,
} from '../hooks/useAppData';
import type { ExpiryStatus, InventoryRow, Product } from '../types';

type InventoryFilter = 'all' | ExpiryStatus | 'empty' | 'archived';

export function InventoryPage() {
  const navigate = useNavigate();
  const { now } = useTaipeiClock();
  const preferences = usePreferences();
  const categories = useCategories();
  const rows = useInventoryRows();
  const archivedProducts = useArchivedProducts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [consumeTarget, setConsumeTarget] = useState<InventoryRow | null>(null);
  const [consumeAmount, setConsumeAmount] = useState(1);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [dialogError, setDialogError] = useState('');

  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const filters: { value: InventoryFilter; label: string }[] = [
    { value: 'all', label: '全部' },
    { value: 'expired', label: '已過期' },
    { value: 'urgent', label: getStatusLabel('urgent', preferences) },
    { value: 'soon', label: getStatusLabel('soon', preferences) },
    { value: 'safe', label: getStatusLabel('safe', preferences) },
    { value: 'empty', label: '零庫存' },
    { value: 'archived', label: '已封存' },
  ];

  const normalizedQuery = normalizeName(query);
  const visibleRows = useMemo(() => {
    if (filter === 'archived') return [];
    return rows.filter((row) => {
      if (normalizedQuery && !row.product.normalizedName.includes(normalizedQuery)) return false;
      if (filter === 'all') return true;
      if (filter === 'empty') return row.totalQuantity === 0;
      if (!row.nearestBatch) return false;
      return getExpiryStatus(row.nearestBatch, preferences, now) === filter;
    });
  }, [filter, normalizedQuery, now, preferences, rows]);
  const visibleArchived = filter === 'archived'
    ? archivedProducts.filter((product) => !normalizedQuery || product.normalizedName.includes(normalizedQuery))
    : [];

  function openConsume(row: InventoryRow) {
    setConsumeTarget(row);
    setConsumeAmount(1);
    setDialogError('');
  }

  async function confirmConsume(archiveWhenEmpty: boolean) {
    if (!consumeTarget) return;
    try {
      await consumeProduct(consumeTarget.product.id, consumeAmount, archiveWhenEmpty);
      setConsumeTarget(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '扣除失敗');
    }
  }

  function openEdit(product: Product) {
    setEditTarget(product);
    setEditName(product.name);
    setEditCategoryId(product.categoryId);
    setDialogError('');
  }

  async function saveProduct() {
    if (!editTarget) return;
    try {
      await updateProduct(editTarget.id, { name: editName, categoryId: editCategoryId });
      setEditTarget(null);
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '儲存失敗');
    }
  }

  const nothingVisible = visibleRows.length === 0 && visibleArchived.length === 0;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.25}>
        <TextField fullWidth size="small" placeholder="搜尋商品" value={query} onChange={(event) => setQuery(event.target.value)} slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon /></InputAdornment> } }} />
        <Button variant="contained" onClick={() => navigate('/add')} sx={{ minWidth: 48, px: 1.5 }}><AddRoundedIcon /></Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, mx: -2, px: 2 }}>
        {filters.map((item) => (
          <Chip key={item.value} clickable label={item.label} color={filter === item.value ? 'primary' : 'default'} variant={filter === item.value ? 'filled' : 'outlined'} onClick={() => setFilter(item.value)} sx={{ flexShrink: 0 }} />
        ))}
      </Stack>

      {nothingVisible ? (
        <EmptyState
          title={rows.length === 0 && archivedProducts.length === 0 ? '還沒有庫存' : '找不到符合的商品'}
          description={rows.length === 0 && archivedProducts.length === 0 ? undefined : '試著更換搜尋文字或篩選條件。'}
          showAction={rows.length === 0 && archivedProducts.length === 0}
        />
      ) : (
        <Stack spacing={1.5}>
          {visibleRows.map((row) => (
            <Card key={row.product.id}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                      <Typography variant="h3" noWrap>{row.product.name}</Typography>
                      <IconButton size="small" aria-label={`編輯${row.product.name}`} onClick={() => openEdit(row.product)}><EditRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {categoryNames.get(row.product.categoryId) ?? '未分類'} · {row.batches.length} 個批次
                    </Typography>
                    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', mt: 1.25, flexWrap: 'wrap' }}>
                      {row.nearestBatch ? (
                        <>
                          <ExpiryChip batch={row.nearestBatch} preferences={preferences} />
                          <Typography variant="caption" color="text.secondary">最近到期 {formatExpiryValue(row.nearestBatch, preferences.showWeekday)}</Typography>
                        </>
                      ) : <Chip size="small" label="目前為 0" variant="outlined" />}
                    </Stack>
                  </Box>
                  <Stack spacing={1} sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary">總數量</Typography>
                      <Typography sx={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>{row.totalQuantity}</Typography>
                    </Box>
                    {row.totalQuantity > 0 ? (
                      <Button size="small" variant="outlined" startIcon={<RemoveRoundedIcon />} onClick={() => openConsume(row)}>扣庫存</Button>
                    ) : (
                      <Button size="small" onClick={() => navigate('/add', { state: { productId: row.product.id, name: row.product.name, categoryId: row.product.categoryId } })}>補貨</Button>
                    )}
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}

          {visibleArchived.map((product) => (
            <Card key={product.id} sx={{ opacity: 0.84 }}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="h3">{product.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{categoryNames.get(product.categoryId) ?? '未分類'} · 已封存</Typography>
                  </Box>
                  <Button variant="outlined" startIcon={<RestoreRoundedIcon />} onClick={() => void setProductArchived(product.id, false)}>解除封存</Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog open={Boolean(consumeTarget)} onClose={() => setConsumeTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>扣除「{consumeTarget?.product.name}」</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography color="text.secondary">系統會自動優先扣除最早到期的批次。</Typography>
            <TextField label="扣除數量" type="number" value={consumeAmount} error={Boolean(dialogError)} helperText={dialogError || `目前共有 ${consumeTarget?.totalQuantity ?? 0}`} onChange={(event) => setConsumeAmount(Math.max(1, Number(event.target.value)))} slotProps={{ htmlInput: { min: 1, max: consumeTarget?.totalQuantity, step: 1, inputMode: 'numeric' } }} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, flexWrap: 'wrap' }}>
          <Button onClick={() => setConsumeTarget(null)}>取消</Button>
          {consumeTarget && consumeAmount >= consumeTarget.totalQuantity ? (
            <>
              <Button color="inherit" onClick={() => void confirmConsume(true)}>扣除並封存</Button>
              <Button variant="contained" onClick={() => void confirmConsume(false)}>扣除並保留 0</Button>
            </>
          ) : (
            <Button variant="contained" onClick={() => void confirmConsume(false)}>確認扣除</Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTarget)} onClose={() => setEditTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>編輯商品</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField autoFocus label="商品名稱" value={editName} onChange={(event) => setEditName(event.target.value)} error={Boolean(dialogError)} helperText={dialogError} />
            <TextField select label="分類" value={editCategoryId} onChange={(event) => setEditCategoryId(event.target.value)}>
              <MenuItem value="">未分類</MenuItem>
              {categories.map((category) => <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>)}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditTarget(null)}>取消</Button>
          <Button variant="contained" disabled={!editName.trim()} onClick={() => void saveProduct()}>儲存</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
