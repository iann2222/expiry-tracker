import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BrightnessAutoRoundedIcon from "@mui/icons-material/BrightnessAutoRounded";
import DarkModeRoundedIcon from "@mui/icons-material/DarkModeRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import PaletteRoundedIcon from "@mui/icons-material/PaletteRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";
import UploadFileRoundedIcon from "@mui/icons-material/UploadFileRounded";
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
  FormControlLabel,
  Snackbar,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import { alpha, darken, lighten } from "@mui/material/styles";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useEffect, useRef, useState } from "react";
import { SortableCategoryRow } from "../components/SortableCategoryRow";
import {
  downloadBackup,
  parseBackupFile,
  restoreBackup,
  type BackupPayload,
} from "../data/backup";
import {
  addCustomCategory,
  countProductsInCategory,
  db,
  defaultPreferences,
  deleteCategory,
  reorderCategories,
} from "../data/database";
import { getStatusLabel } from "../domain/inventory";
import { useCategories, usePreferences } from "../hooks/useAppData";
import type {
  AppPreferences,
  Category,
  ExpiryStatus,
  ThemeMode,
} from "../types";

const colorLabels: Record<ExpiryStatus, string> = {
  expired: "已過期",
  urgent: "近期到期",
  soon: "需要留意",
  safe: "安全庫存",
};

export function SettingsPage() {
  const theme = useTheme();
  const preferences = usePreferences();
  const categories = useCategories();
  const [draft, setDraft] = useState<AppPreferences>(preferences);
  const [orderedCategories, setOrderedCategories] =
    useState<Category[]>(categories);
  const [categoryName, setCategoryName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    category: Category;
    productCount: number;
  } | null>(null);
  const [backupPreview, setBackupPreview] = useState<BackupPayload | null>(
    null,
  );
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    severity: "success" | "error";
  } | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => setDraft(preferences), [preferences]);
  useEffect(() => setOrderedCategories(categories), [categories]);

  const thresholdError =
    !Number.isInteger(draft.urgentDays) || !Number.isInteger(draft.soonDays)
      ? "天數門檻必須是整數"
      : draft.urgentDays < 0
        ? "第一個門檻不能小於 0"
        : draft.soonDays <= draft.urgentDays
          ? "第二個門檻必須大於第一個門檻"
          : "";

  async function savePreferences() {
    if (thresholdError) return;
    await db.preferences.put({
      ...draft,
      id: "app",
      updatedAt: new Date().toISOString(),
    });
    setMessage({ text: "偏好設定已儲存在此裝置", severity: "success" });
  }

  async function saveAppearance(partial: Partial<AppPreferences>) {
    await db.preferences.put({
      ...preferences,
      ...partial,
      id: "app",
      updatedAt: new Date().toISOString(),
    });
  }

  async function createCategory() {
    try {
      await addCustomCategory(categoryName);
      setCategoryName("");
      setMessage({ text: "已新增分類", severity: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "新增分類失敗",
        severity: "error",
      });
    }
  }

  async function requestDelete(category: Category) {
    setDeleteTarget({
      category,
      productCount: await countProductsInCategory(category.id),
    });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const affected = await deleteCategory(deleteTarget.category.id);
    setDeleteTarget(null);
    setMessage({
      text:
        affected > 0
          ? `已刪除分類，${affected} 項商品改為未分類`
          : "已刪除分類",
      severity: "success",
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = orderedCategories.findIndex(
      (category) => category.id === event.active.id,
    );
    const newIndex = orderedCategories.findIndex(
      (category) => category.id === event.over?.id,
    );
    const next = arrayMove(orderedCategories, oldIndex, newIndex);
    setOrderedCategories(next);
    await reorderCategories(next.map((category) => category.id));
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;
    try {
      setBackupPreview(await parseBackupFile(file));
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "無法讀取備份檔",
        severity: "error",
      });
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  }

  async function confirmRestore() {
    if (!backupPreview) return;
    await downloadBackup();
    await restoreBackup(backupPreview);
    setBackupPreview(null);
    setMessage({ text: "備份已還原", severity: "success" });
  }

  const colorText = (color: string) =>
    theme.palette.mode === "dark" ? lighten(color, 0.08) : darken(color, 0.28);

  return (
    <Stack spacing={2}>
      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h2">外觀與日期</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 2 }}
          >
            主題會立即套用，日期顯示設定會同步到所有品項。
          </Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={preferences.themeMode}
            onChange={(_, value: ThemeMode | null) =>
              value && void saveAppearance({ themeMode: value })
            }
          >
            <ToggleButton value="light">
              <LightModeRoundedIcon sx={{ mr: 0.75 }} />
              淺色
            </ToggleButton>
            <ToggleButton value="dark">
              <DarkModeRoundedIcon sx={{ mr: 0.75 }} />
              深色
            </ToggleButton>
            <ToggleButton value="system">
              <BrightnessAutoRoundedIcon sx={{ mr: 0.75 }} />
              系統
            </ToggleButton>
          </ToggleButtonGroup>
          <FormControlLabel
            sx={{ mt: 1.5, ml: 0 }}
            control={
              <Switch
                checked={preferences.showWeekday}
                onChange={(event) =>
                  void saveAppearance({ showWeekday: event.target.checked })
                }
              />
            }
            label="日期顯示星期，例如 2026-07-15（三）"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ alignItems: "center", mb: 2 }}
          >
            <Box
              sx={{
                width: 42,
                height: 42,
                display: "grid",
                placeItems: "center",
                borderRadius: "14px",
                color: "primary.main",
                bgcolor: "secondary.light",
              }}
            >
              <TuneRoundedIcon />
            </Box>
            <Box>
              <Typography variant="h2">效期門檻</Typography>
              <Typography variant="caption" color="text.secondary">
                首頁、篩選和狀態文字會同步更新
              </Typography>
            </Box>
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              fullWidth
              type="number"
              label="近期到期門檻"
              value={draft.urgentDays}
              onChange={(event) =>
                setDraft({ ...draft, urgentDays: Number(event.target.value) })
              }
              slotProps={{
                htmlInput: { min: 0, step: 1, inputMode: "numeric" },
              }}
              helperText={`0～${draft.urgentDays} 天`}
            />
            <TextField
              fullWidth
              type="number"
              label="留意門檻"
              value={draft.soonDays}
              onChange={(event) =>
                setDraft({ ...draft, soonDays: Number(event.target.value) })
              }
              slotProps={{
                htmlInput: {
                  min: draft.urgentDays + 1,
                  step: 1,
                  inputMode: "numeric",
                },
              }}
              helperText={`${draft.urgentDays + 1}～${draft.soonDays} 天`}
            />
          </Stack>
          {thresholdError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {thresholdError}
            </Alert>
          )}
          {!thresholdError && (
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", mt: 2 }}
            >
              {(["urgent", "soon", "safe"] as const).map((status) => (
                <Chip
                  key={status}
                  label={getStatusLabel(status, draft)}
                  sx={{
                    color: colorText(draft.colors[status]),
                    bgcolor: alpha(
                      draft.colors[status],
                      theme.palette.mode === "dark" ? 0.2 : 0.14,
                    ),
                  }}
                />
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Stack
            direction="row"
            spacing={1.25}
            sx={{ alignItems: "center", mb: 2 }}
          >
            <PaletteRoundedIcon color="primary" />
            <Box>
              <Typography variant="h2">狀態顏色</Typography>
              <Typography variant="caption" color="text.secondary">
                預設改為更明亮的色階，仍可自行調整
              </Typography>
            </Box>
          </Stack>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 1.5,
            }}
          >
            {(Object.keys(colorLabels) as ExpiryStatus[]).map((status) => (
              <TextField
                key={status}
                type="color"
                label={colorLabels[status]}
                value={draft.colors[status]}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    colors: { ...draft.colors, [status]: event.target.value },
                  })
                }
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ "& input": { height: 38, p: 0.75, cursor: "pointer" } }}
              />
            ))}
          </Box>
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ justifyContent: "space-between", mt: 2.5 }}
          >
            <Button
              color="inherit"
              startIcon={<RestartAltRoundedIcon />}
              onClick={() =>
                setDraft({
                  ...draft,
                  urgentDays: defaultPreferences.urgentDays,
                  soonDays: defaultPreferences.soonDays,
                  colors: defaultPreferences.colors,
                })
              }
            >
              還原預設
            </Button>
            <Button
              variant="contained"
              disabled={Boolean(thresholdError)}
              onClick={() => void savePreferences()}
            >
              儲存效期偏好
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h2">商品分類</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 2 }}
          >
            按住每列最右側把手即可拖拉排序；所有分類都可以刪除。
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="新的分類名稱"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void createCategory();
                }
              }}
            />
            <Button
              variant="outlined"
              disabled={!categoryName.trim()}
              onClick={() => void createCategory()}
              sx={{ minWidth: 48, px: 1.5 }}
            >
              <AddRoundedIcon />
            </Button>
          </Stack>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(event) => void handleDragEnd(event)}
          >
            <SortableContext
              items={orderedCategories.map((category) => category.id)}
              strategy={verticalListSortingStrategy}
            >
              {orderedCategories.map((category) => (
                <SortableCategoryRow
                  key={category.id}
                  category={category}
                  onDelete={(target) => void requestDelete(target)}
                />
              ))}
            </SortableContext>
          </DndContext>
          {orderedCategories.length === 0 && (
            <Typography
              color="text.secondary"
              sx={{ py: 3, textAlign: "center" }}
            >
              目前沒有分類
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 2.5 }}>
          <Typography variant="h2">資料備份與還原</Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, mb: 2 }}
          >
            匯出內容包含商品、批次、歷史紀錄、分類與偏好設定。匯入前會先顯示摘要。
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25}>
            <Button
              fullWidth
              variant="outlined"
              startIcon={<FileDownloadRoundedIcon />}
              onClick={() => void downloadBackup()}
            >
              匯出 JSON
            </Button>
            <Button
              fullWidth
              variant="contained"
              startIcon={<UploadFileRoundedIcon />}
              onClick={() => importInputRef.current?.click()}
            >
              匯入 JSON
            </Button>
            <input
              ref={importInputRef}
              hidden
              type="file"
              accept="application/json,.json"
              onChange={(event) =>
                void handleImportFile(event.target.files?.[0])
              }
            />
          </Stack>
        </CardContent>
      </Card>

      <Alert severity="info" variant="outlined">
        本 App 的日期與所有到期計算固定使用
        Asia/Taipei（UTC+8），目前不支援其他時區。裝置時區不同也不會改變計算結果。
      </Alert>

      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>刪除「{deleteTarget?.category.name}」？</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            {deleteTarget?.productCount
              ? `目前有 ${deleteTarget.productCount} 項商品使用此分類；刪除後會改為未分類。`
              : "此操作不會刪除商品。"}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button color="error" onClick={() => void confirmDelete()}>
            刪除分類
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(backupPreview)}
        onClose={() => setBackupPreview(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>確認取代目前資料</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            匯入會完整取代目前資料；系統會先自動下載現有資料的備份。
          </Alert>
          <Stack spacing={0.75}>
            <Typography>
              商品：{backupPreview?.data.products.length ?? 0} 項
            </Typography>
            <Typography>
              批次：{backupPreview?.data.batches.length ?? 0} 筆
            </Typography>
            <Typography>
              歷史紀錄：{backupPreview?.data.movements.length ?? 0} 筆
            </Typography>
            <Typography>
              分類：{backupPreview?.data.categories.length ?? 0} 個
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setBackupPreview(null)}>取消</Button>
          <Button
            color="warning"
            variant="contained"
            onClick={() => void confirmRestore()}
          >
            取代並還原
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(message)}
        autoHideDuration={2800}
        onClose={() => setMessage(null)}
        message={message?.text}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{
          content: {
            sx:
              message?.severity === "error"
                ? { bgcolor: "error.dark" }
                : undefined,
          },
        }}
      />
    </Stack>
  );
}
