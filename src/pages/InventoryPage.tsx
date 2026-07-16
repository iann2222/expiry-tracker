import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ListAltRoundedIcon from '@mui/icons-material/ListAltRounded';
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded';
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { DateTimePopoverField } from '../components/DateTimePopoverField';
import { EmptyState } from '../components/EmptyState';
import { ExpiryChip } from '../components/ExpiryChip';
import { useTaipeiClock } from '../context/TaipeiClockContext';
import {
  removeStock,
  setProductArchived,
  updateBatch,
  updateProduct,
} from '../data/database';
import { getExpiryStatus, getStatusLabel, normalizeName } from '../domain/inventory';
import { formatDate, formatExpiryValue } from '../domain/taipeiTime';
import {
  useArchivedProducts,
  useCategories,
  useInventoryRows,
  usePreferences,
  useProductBatches,
} from '../hooks/useAppData';
import type {
  Batch,
  ExpiryPrecision,
  ExpiryStatus,
  InventoryRow,
  Product,
} from '../types';

type InventoryFilter = 'all' | ExpiryStatus | 'empty' | 'archived';
type StockAction = 'consume' | 'discard';
type Overlay =
  | { kind: 'details'; productId: string }
  | { kind: 'batch-edit'; productId: string; batchId: string }
  | {
      kind: 'stock';
      productId: string;
      batchId?: string;
      action: StockAction;
      returnTo: 'details' | 'inventory';
    }
  | { kind: 'product-edit'; productId: string }
  | null;

interface InventoryLocationState {
  stock?: {
    productId: string;
    batchId?: string;
    action: StockAction;
  };
}

interface BatchDraft {
  quantity: string;
  expiryDate: string;
  expiryTime: string;
  expiryPrecision: ExpiryPrecision;
  purchaseDate: string;
  note: string;
  reason: string;
}

export function InventoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('sm'));
  const { now } = useTaipeiClock();
  const preferences = usePreferences();
  const categories = useCategories();
  const rows = useInventoryRows();
  const archivedProducts = useArchivedProducts();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [stockAmount, setStockAmount] = useState('1');
  const [stockNote, setStockNote] = useState('');
  const [archiveWhenEmpty, setArchiveWhenEmpty] = useState(true);
  const [batchDraft, setBatchDraft] = useState<BatchDraft | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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
  const visibleArchived =
    filter === 'archived'
      ? archivedProducts.filter(
          (product) => !normalizedQuery || product.normalizedName.includes(normalizedQuery),
        )
      : [];

  const activeProductId = overlay?.productId;
  const productBatches = useProductBatches(activeProductId);
  const selectedRow = rows.find((row) => row.product.id === activeProductId);
  const selectedProduct =
    selectedRow?.product ?? archivedProducts.find((product) => product.id === activeProductId);
  const selectedBatch =
    overlay && 'batchId' in overlay && overlay.batchId
      ? productBatches.find((batch) => batch.id === overlay.batchId)
      : undefined;
  const activeBatches = productBatches.filter((batch) => batch.quantity > 0);
  const completedBatches = productBatches.filter((batch) => batch.quantity === 0);
  const productTotalQuantity = productBatches.reduce((sum, batch) => sum + batch.quantity, 0);
  const availableQuantity =
    overlay?.kind === 'stock'
      ? selectedBatch?.quantity ?? selectedRow?.totalQuantity ?? 0
      : 0;
  const stockAmountNumber = Number(stockAmount);
  const willEmptyProduct =
    overlay?.kind === 'stock' &&
    Number.isSafeInteger(stockAmountNumber) &&
    stockAmountNumber === productTotalQuantity;

  useEffect(() => {
    const state = (location.state ?? {}) as InventoryLocationState;
    if (!state.stock) return;
    const productExists =
      rows.some((row) => row.product.id === state.stock!.productId) ||
      archivedProducts.some((product) => product.id === state.stock!.productId);
    if (!productExists) return;
    setOverlay({
      kind: 'stock',
      productId: state.stock.productId,
      batchId: state.stock.batchId,
      action: state.stock.action,
      returnTo: 'inventory',
    });
    setStockAmount('1');
    setStockNote('');
    setArchiveWhenEmpty(true);
    setDialogError('');
    navigate('/inventory', { replace: true, state: null });
  }, [archivedProducts, location.state, navigate, rows]);

  function openStock(
    row: InventoryRow,
    options?: {
      batch?: Batch;
      action?: StockAction;
      returnTo?: 'details' | 'inventory';
    },
  ) {
    setOverlay({
      kind: 'stock',
      productId: row.product.id,
      batchId: options?.batch?.id,
      action: options?.action ?? 'consume',
      returnTo: options?.returnTo ?? 'inventory',
    });
    setStockAmount('1');
    setStockNote('');
    setArchiveWhenEmpty(true);
    setDialogError('');
  }

  function closeStock() {
    if (overlay?.kind === 'stock' && overlay.returnTo === 'details') {
      setOverlay({ kind: 'details', productId: overlay.productId });
    } else {
      setOverlay(null);
    }
    setDialogError('');
  }

  function openProductEdit(product: Product) {
    setOverlay({ kind: 'product-edit', productId: product.id });
    setEditName(product.name);
    setEditCategoryId(product.categoryId);
    setDialogError('');
  }

  function openBatchEdit(productId: string, batch: Batch) {
    setOverlay({ kind: 'batch-edit', productId, batchId: batch.id });
    setBatchDraft({
      quantity: String(batch.quantity),
      expiryDate: batch.expiryDate,
      expiryTime: batch.expiryTime ?? '00:00',
      expiryPrecision: batch.expiryPrecision,
      purchaseDate: batch.purchaseDate ?? '',
      note: batch.note ?? '',
      reason: '',
    });
    setDialogError('');
  }

  async function submitStock() {
    if (overlay?.kind !== 'stock' || !selectedProduct) return;
    if (!Number.isSafeInteger(stockAmountNumber) || stockAmountNumber < 1) {
      setDialogError('請輸入正整數數量');
      return;
    }
    if (stockAmountNumber > availableQuantity) {
      setDialogError('處理數量不可大於可用庫存');
      return;
    }
    if (overlay.action === 'discard' && !stockNote.trim()) {
      setDialogError('請填寫丟棄原因');
      return;
    }

    setSaving(true);
    setDialogError('');
    try {
      await removeStock({
        productId: selectedProduct.id,
        batchId: overlay.batchId,
        amount: stockAmountNumber,
        type: overlay.action,
        note: stockNote,
        archiveWhenEmpty: willEmptyProduct && archiveWhenEmpty,
      });
      const returnTo = overlay.returnTo;
      const productId = overlay.productId;
      setOverlay(returnTo === 'details' ? { kind: 'details', productId } : null);
      setMessage(overlay.action === 'discard' ? '已記錄丟棄' : '已記錄消耗');
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '庫存處理失敗');
    } finally {
      setSaving(false);
    }
  }

  async function saveProduct() {
    if (overlay?.kind !== 'product-edit') return;
    setSaving(true);
    setDialogError('');
    try {
      await updateProduct(overlay.productId, { name: editName, categoryId: editCategoryId });
      setOverlay(null);
      setMessage('商品資料已更新');
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function saveBatch() {
    if (overlay?.kind !== 'batch-edit' || !batchDraft) return;
    const quantity = Number(batchDraft.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      setDialogError('盤點後數量必須是 0 以上的整數');
      return;
    }
    setSaving(true);
    setDialogError('');
    try {
      const changed = await updateBatch(overlay.batchId, {
        quantity,
        expiryDate: batchDraft.expiryDate,
        expiryTime: batchDraft.expiryTime,
        expiryPrecision: batchDraft.expiryPrecision,
        purchaseDate: batchDraft.purchaseDate,
        note: batchDraft.note,
        reason: batchDraft.reason,
      });
      setOverlay({ kind: 'details', productId: overlay.productId });
      setMessage(changed ? '批次資料已更新' : '批次資料沒有變更');
    } catch (error) {
      setDialogError(error instanceof Error ? error.message : '批次儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  async function changeArchived(productId: string, archived: boolean) {
    try {
      await setProductArchived(productId, archived);
      setMessage(archived ? '商品已封存' : '商品已解除封存');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '封存狀態更新失敗');
    }
  }

  const nothingVisible = visibleRows.length === 0 && visibleArchived.length === 0;

  function renderBatchCard(batch: Batch, completed = false) {
    return (
      <Card key={batch.id} variant="outlined">
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
          <Stack spacing={1.25}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography sx={{ fontWeight: 750 }}>
                  {formatExpiryValue(batch, preferences.showWeekday)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  目前數量 {batch.quantity}
                </Typography>
              </Box>
              {completed ? (
                <Chip size="small" label="已結束" variant="outlined" />
              ) : (
                <ExpiryChip batch={batch} preferences={preferences} />
              )}
            </Stack>
            {(batch.purchaseDate || batch.note) && <Divider />}
            {batch.purchaseDate && (
              <Typography variant="body2" color="text.secondary">
                購買日：{formatDate(batch.purchaseDate, preferences.showWeekday)}
              </Typography>
            )}
            {batch.note && (
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                {batch.note}
              </Typography>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {!completed && selectedRow && (
                <>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<RemoveRoundedIcon />}
                    onClick={() =>
                      openStock(selectedRow, {
                        batch,
                        action: 'consume',
                        returnTo: 'details',
                      })
                    }
                  >
                    消耗
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteOutlineRoundedIcon />}
                    onClick={() =>
                      openStock(selectedRow, {
                        batch,
                        action: 'discard',
                        returnTo: 'details',
                      })
                    }
                  >
                    丟棄
                  </Button>
                </>
              )}
              <Button
                size="small"
                startIcon={<EditRoundedIcon />}
                onClick={() => openBatchEdit(batch.productId, batch)}
              >
                {completed ? '盤點更正' : '編輯批次'}
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1.25}>
        <TextField
          fullWidth
          size="small"
          placeholder="搜尋商品"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        <Button
          variant="contained"
          aria-label="新增商品"
          onClick={() => navigate('/add')}
          sx={{ minWidth: 48, px: 1.5 }}
        >
          <AddRoundedIcon />
        </Button>
      </Stack>

      <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5, mx: -2, px: 2 }}>
        {filters.map((item) => (
          <Chip
            key={item.value}
            clickable
            label={item.label}
            color={filter === item.value ? 'primary' : 'default'}
            variant={filter === item.value ? 'filled' : 'outlined'}
            onClick={() => setFilter(item.value)}
            sx={{ flexShrink: 0 }}
          />
        ))}
      </Stack>

      {nothingVisible ? (
        <EmptyState
          title={
            rows.length === 0 && archivedProducts.length === 0
              ? '還沒有庫存'
              : '找不到符合的商品'
          }
          description={
            rows.length === 0 && archivedProducts.length === 0
              ? undefined
              : '試著更換搜尋文字或篩選條件。'
          }
          showAction={rows.length === 0 && archivedProducts.length === 0}
        />
      ) : (
        <Stack spacing={1.5}>
          {visibleRows.map((row) => {
            const nearestIsExpired =
              row.nearestBatch &&
              getExpiryStatus(row.nearestBatch, preferences, now) === 'expired';
            return (
              <Card key={row.product.id}>
                <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                  <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
                        <Typography variant="h3" noWrap>
                          {row.product.name}
                        </Typography>
                        <IconButton
                          size="small"
                          aria-label={`編輯${row.product.name}`}
                          onClick={() => openProductEdit(row.product)}
                        >
                          <EditRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        {categoryNames.get(row.product.categoryId) ?? '未分類'} · {row.batches.length}{' '}
                        個現有批次
                      </Typography>
                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{ alignItems: 'center', mt: 1.25, flexWrap: 'wrap' }}
                      >
                        {row.nearestBatch ? (
                          <>
                            <ExpiryChip batch={row.nearestBatch} preferences={preferences} />
                            <Typography variant="caption" color="text.secondary">
                              最近到期{' '}
                              {formatExpiryValue(row.nearestBatch, preferences.showWeekday)}
                            </Typography>
                          </>
                        ) : (
                          <Chip size="small" label="目前為 0" variant="outlined" />
                        )}
                        <Button
                          size="small"
                          startIcon={<ListAltRoundedIcon />}
                          onClick={() =>
                            setOverlay({ kind: 'details', productId: row.product.id })
                          }
                        >
                          查看批次
                        </Button>
                      </Stack>
                    </Box>
                    <Stack spacing={1} sx={{ alignItems: 'flex-end', justifyContent: 'space-between' }}>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="text.secondary">
                          總數量
                        </Typography>
                        <Typography sx={{ fontSize: '1.65rem', fontWeight: 800, lineHeight: 1.1 }}>
                          {row.totalQuantity}
                        </Typography>
                      </Box>
                      {row.totalQuantity > 0 ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color={nearestIsExpired ? 'error' : 'primary'}
                          startIcon={
                            nearestIsExpired ? (
                              <DeleteOutlineRoundedIcon />
                            ) : (
                              <RemoveRoundedIcon />
                            )
                          }
                          onClick={() =>
                            openStock(row, {
                              batch: nearestIsExpired ? row.nearestBatch : undefined,
                              action: nearestIsExpired ? 'discard' : 'consume',
                            })
                          }
                        >
                          {nearestIsExpired ? '處理過期' : '消耗'}
                        </Button>
                      ) : (
                        <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
                          <Button
                            size="small"
                            onClick={() =>
                              navigate('/add', {
                                state: {
                                  productId: row.product.id,
                                  name: row.product.name,
                                  categoryId: row.product.categoryId,
                                },
                              })
                            }
                          >
                            補貨
                          </Button>
                          <Button
                            size="small"
                            color="inherit"
                            startIcon={<ArchiveRoundedIcon />}
                            onClick={() => void changeArchived(row.product.id, true)}
                          >
                            封存
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}

          {visibleArchived.map((product) => (
            <Card key={product.id} sx={{ opacity: 0.84 }}>
              <CardContent sx={{ p: 2.25, '&:last-child': { pb: 2.25 } }}>
                <Stack
                  direction="row"
                  spacing={2}
                  sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <Box>
                    <Typography variant="h3">{product.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {categoryNames.get(product.categoryId) ?? '未分類'} · 已封存
                    </Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    startIcon={<RestoreRoundedIcon />}
                    onClick={() => void changeArchived(product.id, false)}
                  >
                    解除封存
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      <Dialog
        open={overlay?.kind === 'details'}
        onClose={() => setOverlay(null)}
        fullScreen={fullScreenDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{selectedProduct?.name ?? '批次詳情'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Alert severity="info">
              消耗可依商品先到期先扣，或指定批次；丟棄一定會鎖定批次，避免誤扣。
            </Alert>
            <Box>
              <Typography variant="h3" sx={{ mb: 1 }}>
                現有批次（{activeBatches.length}）
              </Typography>
              {activeBatches.length > 0 ? (
                <Stack spacing={1.25}>{activeBatches.map((batch) => renderBatchCard(batch))}</Stack>
              ) : (
                <Typography color="text.secondary">目前沒有現有批次。</Typography>
              )}
            </Box>
            {completedBatches.length > 0 && (
              <Accordion disableGutters elevation={0}>
                <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                  <Typography sx={{ fontWeight: 700 }}>
                    已結束批次（{completedBatches.length}）
                  </Typography>
                </AccordionSummary>
                <AccordionDetails sx={{ px: 0 }}>
                  <Stack spacing={1.25}>
                    {completedBatches.map((batch) => renderBatchCard(batch, true))}
                  </Stack>
                </AccordionDetails>
              </Accordion>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOverlay(null)}>關閉</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={overlay?.kind === 'stock'}
        onClose={closeStock}
        fullScreen={fullScreenDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {overlay?.kind === 'stock' && overlay.action === 'discard' ? '丟棄庫存' : '記錄消耗'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <Box>
              <Typography sx={{ fontWeight: 750 }}>{selectedProduct?.name}</Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedBatch
                  ? `指定批次：${formatExpiryValue(selectedBatch, preferences.showWeekday)}`
                  : '系統會優先扣除最早到期的批次。'}
              </Typography>
            </Box>
            {selectedBatch ? (
              <ToggleButtonGroup
                exclusive
                fullWidth
                aria-label="庫存處理方式"
                value={overlay?.kind === 'stock' ? overlay.action : 'consume'}
                onChange={(_, value: StockAction | null) => {
                  if (value && overlay?.kind === 'stock') {
                    setOverlay({ ...overlay, action: value });
                    setDialogError('');
                  }
                }}
              >
                <ToggleButton value="consume">消耗</ToggleButton>
                <ToggleButton value="discard">丟棄</ToggleButton>
              </ToggleButtonGroup>
            ) : (
              <Chip label="消耗（先到期先扣）" color="primary" variant="outlined" />
            )}
            <TextField
              autoFocus
              label="處理數量"
              type="number"
              value={stockAmount}
              onChange={(event) => setStockAmount(event.target.value)}
              helperText={`可用數量 ${availableQuantity}`}
              slotProps={{
                htmlInput: { min: 1, max: availableQuantity, step: 1, inputMode: 'numeric' },
              }}
            />
            <TextField
              label={
                overlay?.kind === 'stock' && overlay.action === 'discard'
                  ? '丟棄原因（必填）'
                  : '備註（選填）'
              }
              value={stockNote}
              onChange={(event) => setStockNote(event.target.value)}
              multiline
              minRows={2}
            />
            {willEmptyProduct && (
              <FormControlLabel
                control={
                  <Checkbox
                    checked={archiveWhenEmpty}
                    onChange={(event) => setArchiveWhenEmpty(event.target.checked)}
                  />
                }
                label="歸零後封存商品"
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeStock}>
            {overlay?.kind === 'stock' && overlay.action === 'discard' ? '保留現況' : '取消'}
          </Button>
          <Button
            variant="contained"
            color={overlay?.kind === 'stock' && overlay.action === 'discard' ? 'error' : 'primary'}
            disabled={saving}
            onClick={() => void submitStock()}
          >
            {overlay?.kind === 'stock' && overlay.action === 'discard'
              ? `丟棄 ${stockAmount || 0} 件`
              : `消耗 ${stockAmount || 0} 件`}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={overlay?.kind === 'batch-edit'}
        onClose={() =>
          overlay?.kind === 'batch-edit' &&
          setOverlay({ kind: 'details', productId: overlay.productId })
        }
        fullScreen={fullScreenDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>編輯批次</DialogTitle>
        <DialogContent>
          {batchDraft && (
            <Stack spacing={2} sx={{ pt: 0.5 }}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <TextField
                autoFocus
                label="盤點後數量"
                type="number"
                value={batchDraft.quantity}
                onChange={(event) =>
                  setBatchDraft({ ...batchDraft, quantity: event.target.value })
                }
                helperText={`目前數量 ${selectedBatch?.quantity ?? 0}`}
                slotProps={{ htmlInput: { min: 0, step: 1, inputMode: 'numeric' } }}
              />
              <DateTimePopoverField
                label="有效期限"
                date={batchDraft.expiryDate}
                onDateChange={(expiryDate) => setBatchDraft({ ...batchDraft, expiryDate })}
                time={batchDraft.expiryTime}
                onTimeChange={(expiryTime) => setBatchDraft({ ...batchDraft, expiryTime })}
                precision={batchDraft.expiryPrecision}
                onPrecisionChange={(expiryPrecision) =>
                  setBatchDraft({ ...batchDraft, expiryPrecision })
                }
                allowTime
                showWeekday={preferences.showWeekday}
              />
              <DateTimePopoverField
                label="購買日期"
                date={batchDraft.purchaseDate}
                onDateChange={(purchaseDate) => setBatchDraft({ ...batchDraft, purchaseDate })}
                showWeekday={preferences.showWeekday}
                clearable
              />
              <TextField
                label="批次備註"
                value={batchDraft.note}
                onChange={(event) => setBatchDraft({ ...batchDraft, note: event.target.value })}
                multiline
                minRows={2}
              />
              <TextField
                label="調整原因"
                value={batchDraft.reason}
                onChange={(event) => setBatchDraft({ ...batchDraft, reason: event.target.value })}
                helperText="盤點數量有變更時必填；只改日期或備註可留空。"
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() =>
              overlay?.kind === 'batch-edit' &&
              setOverlay({ kind: 'details', productId: overlay.productId })
            }
          >
            返回批次
          </Button>
          <Button variant="contained" disabled={saving} onClick={() => void saveBatch()}>
            儲存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={overlay?.kind === 'product-edit'}
        onClose={() => setOverlay(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>編輯商品</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <TextField
              autoFocus
              label="商品名稱"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              error={Boolean(dialogError)}
              helperText={dialogError}
            />
            <TextField
              select
              label="分類"
              value={editCategoryId}
              onChange={(event) => setEditCategoryId(event.target.value)}
            >
              <MenuItem value="">未分類</MenuItem>
              {categories.map((category) => (
                <MenuItem key={category.id} value={category.id}>
                  {category.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOverlay(null)}>取消</Button>
          <Button
            variant="contained"
            disabled={!editName.trim() || saving}
            onClick={() => void saveProduct()}
          >
            儲存
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={2600}
        message={message}
        onClose={() => setMessage(null)}
      />
    </Stack>
  );
}
