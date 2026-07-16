import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import {
  Box,
  Button,
  MenuItem,
  Popover,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useState, type SyntheticEvent } from 'react';
import { useTaipeiClock } from '../context/TaipeiClockContext';
import {
  clampDateParts,
  daysInMonth,
  formatDate,
  formatExpiryValue,
  getTaipeiDateParts,
  getWeekdayName,
  parseIsoDate,
  toIsoDate,
} from '../domain/taipeiTime';
import type { ExpiryPrecision } from '../types';

interface DateTimePopoverFieldProps {
  label: string;
  date: string;
  onDateChange: (value: string) => void;
  showWeekday: boolean;
  error?: boolean;
  helperText?: string;
  allowTime?: boolean;
  time?: string;
  precision?: ExpiryPrecision;
  onTimeChange?: (value: string) => void;
  onPrecisionChange?: (value: ExpiryPrecision) => void;
  clearable?: boolean;
}

export function DateTimePopoverField({
  label,
  date,
  onDateChange,
  showWeekday,
  error,
  helperText,
  allowTime = false,
  time = '00:00',
  precision = 'day',
  onTimeChange,
  onPrecisionChange,
  clearable = false,
}: DateTimePopoverFieldProps) {
  const { now } = useTaipeiClock();
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null);
  const [draftDate, setDraftDate] = useState(date);
  const [draftTime, setDraftTime] = useState(time);
  const [draftPrecision, setDraftPrecision] = useState(precision);
  const currentYear = getTaipeiDateParts(now).year;
  const parsedDraft = parseIsoDate(draftDate) ?? getTaipeiDateParts(now);
  const firstYear = Math.min(currentYear - 10, parsedDraft.year);
  const lastYear = Math.max(currentYear + 10, parsedDraft.year);
  const yearOptions = Array.from(
    { length: lastYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );
  const monthOptions = Array.from({ length: 12 }, (_, index) => index + 1);
  const hourOptions = Array.from({ length: 24 }, (_, index) => index);
  const minuteOptions = Array.from({ length: 60 }, (_, index) => index);

  const dayOptions = Array.from(
    { length: daysInMonth(parsedDraft.year, parsedDraft.month) },
    (_, index) => index + 1,
  );
  const [draftHour = '00', draftMinute = '00'] = draftTime.split(':');

  const displayValue = date
    ? allowTime
      ? formatExpiryValue(
          { expiryDate: date, expiryTime: time, expiryPrecision: precision },
          showWeekday,
        )
      : formatDate(date, showWeekday)
    : '';

  function openPopover(event: SyntheticEvent<HTMLElement>) {
    const fallback = getTaipeiDateParts(now);
    const parsed = parseIsoDate(date) ?? fallback;
    setDraftDate(toIsoDate(parsed));
    setDraftTime(time || '00:00');
    setDraftPrecision(precision);
    setAnchorElement(event.currentTarget);
  }

  function updateDate(part: 'year' | 'month' | 'day', value: number) {
    setDraftDate(toIsoDate(clampDateParts({ ...parsedDraft, [part]: value })));
  }

  function confirm() {
    onDateChange(draftDate);
    if (allowTime) {
      onPrecisionChange?.(draftPrecision);
      onTimeChange?.(
        draftPrecision === 'day'
          ? '00:00'
          : `${draftHour.padStart(2, '0')}:${draftPrecision === 'hour' ? '00' : draftMinute.padStart(2, '0')}`,
      );
    }
    setAnchorElement(null);
  }

  return (
    <>
      <TextField
        fullWidth
        label={label}
        value={displayValue}
        placeholder="請選擇日期"
        error={error}
        helperText={helperText}
        onClick={openPopover}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPopover(event);
          }
        }}
        slotProps={{
          inputLabel: { shrink: true },
          input: {
            readOnly: true,
            endAdornment: allowTime ? <AccessTimeRoundedIcon color="action" /> : <CalendarMonthRoundedIcon color="action" />,
          },
          htmlInput: { style: { cursor: 'pointer' } },
        }}
      />

      <Popover
        open={Boolean(anchorElement)}
        anchorEl={anchorElement}
        onClose={() => setAnchorElement(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { width: 'min(420px, calc(100vw - 24px))', mt: 1, p: 2 } } }}
      >
        <Stack spacing={2}>
          <Typography variant="h3">選擇{label}</Typography>

          {allowTime && (
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              aria-label={`${label}精度`}
              value={draftPrecision}
              onChange={(_, value: ExpiryPrecision | null) => value && setDraftPrecision(value)}
            >
              <ToggleButton value="day">日期</ToggleButton>
              <ToggleButton value="hour">到小時</ToggleButton>
              <ToggleButton value="minute">到分鐘</ToggleButton>
            </ToggleButtonGroup>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: '1.25fr 1fr 1fr', gap: 1 }}>
            <TextField
              select
              size="small"
              label="年"
              value={parsedDraft.year}
              onChange={(event) => updateDate('year', Number(event.target.value))}
            >
              {yearOptions.map((year) => (
                <MenuItem key={year} value={year}>{year} 年</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="月"
              value={parsedDraft.month}
              onChange={(event) => updateDate('month', Number(event.target.value))}
            >
              {monthOptions.map((month) => (
                <MenuItem key={month} value={month}>{month} 月</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="日"
              value={parsedDraft.day}
              onChange={(event) => updateDate('day', Number(event.target.value))}
            >
              {dayOptions.map((day) => (
                <MenuItem key={day} value={day}>
                  {day} 日{showWeekday ? `（${getWeekdayName(toIsoDate({ ...parsedDraft, day }))}）` : ''}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          {allowTime && draftPrecision !== 'day' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: draftPrecision === 'minute' ? '1fr 1fr' : '1fr', gap: 1 }}>
              <TextField
                select
                size="small"
                label="時"
                value={Number(draftHour)}
                onChange={(event) => setDraftTime(`${String(event.target.value).padStart(2, '0')}:${draftMinute}`)}
              >
                {hourOptions.map((hour) => (
                  <MenuItem key={hour} value={hour}>{hour.toString().padStart(2, '0')} 時</MenuItem>
                ))}
              </TextField>
              {draftPrecision === 'minute' && (
                <TextField
                  select
                  size="small"
                  label="分"
                  value={Number(draftMinute)}
                  onChange={(event) => setDraftTime(`${draftHour}:${String(event.target.value).padStart(2, '0')}`)}
                >
                  {minuteOptions.map((minute) => (
                    <MenuItem key={minute} value={minute}>{minute.toString().padStart(2, '0')} 分</MenuItem>
                  ))}
                </TextField>
              )}
            </Box>
          )}

          <Typography variant="body2" color="text.secondary">
            {draftDate &&
              (allowTime
                ? formatExpiryValue(
                    { expiryDate: draftDate, expiryTime: draftTime, expiryPrecision: draftPrecision },
                    showWeekday,
                  )
                : formatDate(draftDate, showWeekday))}
          </Typography>

          <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
            {clearable && date && (
              <Button
                color="inherit"
                onClick={() => {
                  onDateChange('');
                  setAnchorElement(null);
                }}
                sx={{ mr: 'auto' }}
              >
                清除
              </Button>
            )}
            <Button color="inherit" onClick={() => setAnchorElement(null)}>取消</Button>
            <Button variant="contained" onClick={confirm}>套用</Button>
          </Stack>
        </Stack>
      </Popover>
    </>
  );
}
