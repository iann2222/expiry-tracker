import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import InventoryRoundedIcon from '@mui/icons-material/InventoryRounded';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { addInventoryBatch, db } from '../data/database';
import { normalizeName } from '../domain/inventory';
import { useCategories, usePreferences } from '../hooks/useAppData';
import type { ExpiryPrecision, Product } from '../types';
import { DateTimePopoverField } from '../components/DateTimePopoverField';

interface AddFormValues {
  name: string;
  quantity: number;
  expiryDate: string;
  expiryTime: string;
  expiryPrecision: ExpiryPrecision;
  categoryId: string;
  purchaseDate: string;
  note: string;
}

interface AddLocationState {
  productId?: string;
  name?: string;
  categoryId?: string;
}

export function AddItemPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const categories = useCategories();
  const preferences = usePreferences();
  const locationState = (location.state ?? {}) as AddLocationState;
  const [duplicate, setDuplicate] = useState<Product | null>(null);
  const [pendingValues, setPendingValues] = useState<AddFormValues | null>(null);
  const [submitError, setSubmitError] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddFormValues>({
    defaultValues: {
      name: locationState.name ?? '',
      quantity: 1,
      expiryDate: '',
      expiryTime: '00:00',
      expiryPrecision: 'day',
      categoryId: locationState.categoryId ?? '',
      purchaseDate: '',
      note: '',
    },
  });

  const nameRegistration = register('name', { required: '請輸入商品名稱' });

  useEffect(() => {
    if (!locationState.categoryId && categories.length > 0) {
      const fallback = categories.find((category) => category.name === '其他') ?? categories[0];
      setValue('categoryId', fallback.id);
    }
  }, [categories, locationState.categoryId, setValue]);

  async function persist(values: AddFormValues, existingProductId?: string) {
    await addInventoryBatch({
      name: values.name,
      quantity: Number(values.quantity),
      expiryDate: values.expiryDate,
      expiryTime: values.expiryTime,
      expiryPrecision: values.expiryPrecision,
      categoryId: values.categoryId,
      purchaseDate: values.purchaseDate,
      note: values.note,
      existingProductId,
    });
    navigate('/inventory', { replace: true });
  }

  async function onSubmit(values: AddFormValues) {
    setSubmitError('');
    try {
      if (locationState.productId) {
        await persist(values, locationState.productId);
        return;
      }

      const matchedProduct = await db.products
        .where('normalizedName')
        .equals(normalizeName(values.name))
        .first();

      if (matchedProduct) {
        setPendingValues(values);
        setDuplicate(matchedProduct);
        return;
      }

      await persist(values);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '新增失敗，請稍後再試');
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h1">幾秒完成建檔</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          先填三個必要欄位，其他資料之後也能補上。
        </Typography>
      </Box>

      <Card component="form" onSubmit={handleSubmit(onSubmit)}>
        <CardContent sx={{ p: 2.5 }}>
          <Stack spacing={2.25}>
            {submitError && <Alert severity="error">{submitError}</Alert>}
            <TextField
              label="商品名稱"
              fullWidth
              autoFocus
              autoComplete="off"
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
              {...nameRegistration}
              inputRef={(element) => {
                nameRegistration.ref(element);
                nameInputRef.current = element;
              }}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="數量"
                type="number"
                autoComplete="off"
                fullWidth
                error={Boolean(errors.quantity)}
                helperText={errors.quantity?.message}
                slotProps={{ htmlInput: { min: 1, step: 1, inputMode: 'numeric' } }}
                {...register('quantity', {
                  valueAsNumber: true,
                  required: '請輸入數量',
                  min: { value: 1, message: '數量至少為 1' },
                  validate: (value) => Number.isSafeInteger(value) || '數量過大或不是整數',
                })}
              />
              <Controller
                control={control}
                name="expiryDate"
                rules={{ required: '請選擇有效期限' }}
                render={({ field }) => (
                  <Controller
                    control={control}
                    name="expiryTime"
                    render={({ field: timeField }) => (
                      <Controller
                        control={control}
                        name="expiryPrecision"
                        render={({ field: precisionField }) => (
                          <DateTimePopoverField
                            label="有效期限"
                            date={field.value}
                            onDateChange={field.onChange}
                            time={timeField.value}
                            onTimeChange={timeField.onChange}
                            precision={precisionField.value}
                            onPrecisionChange={precisionField.onChange}
                            allowTime
                            showWeekday={preferences.showWeekday}
                            error={Boolean(errors.expiryDate)}
                            helperText={errors.expiryDate?.message}
                          />
                        )}
                      />
                    )}
                  />
                )}
              />
            </Stack>

            <Accordion disableGutters elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
              <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />}>
                <Typography sx={{ fontWeight: 700 }}>更多資料（選填）</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Stack spacing={2}>
                  <TextField select label="分類" fullWidth defaultValue="" {...register('categoryId')}>
                    <MenuItem value="">未分類</MenuItem>
                    {categories.map((category) => (
                      <MenuItem key={category.id} value={category.id}>
                        {category.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Controller
                    control={control}
                    name="purchaseDate"
                    render={({ field }) => (
                      <DateTimePopoverField
                        label="購買日期"
                        date={field.value}
                        onDateChange={field.onChange}
                        showWeekday={preferences.showWeekday}
                      />
                    )}
                  />
                  <TextField
                    label="備註"
                    fullWidth
                    multiline
                    minRows={2}
                    autoComplete="off"
                    {...register('note')}
                  />
                </Stack>
              </AccordionDetails>
            </Accordion>

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitting}
              startIcon={<InventoryRoundedIcon />}
            >
              儲存商品
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={Boolean(duplicate)} onClose={() => setDuplicate(null)} fullWidth maxWidth="xs">
        <DialogTitle>發現同名商品</DialogTitle>
        <DialogContent>
          <Typography>
            已存在「<strong>{duplicate?.name}</strong>」，這次新增的是同一項商品嗎？
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            選擇同一商品後會建立新批次，效期與數量仍分開記錄。
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => {
              setDuplicate(null);
              requestAnimationFrame(() => nameInputRef.current?.focus());
            }}
          >
            修改名稱
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              if (pendingValues && duplicate) {
                void persist({ ...pendingValues, categoryId: duplicate.categoryId }, duplicate.id);
              }
            }}
          >
            加入同一商品
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
