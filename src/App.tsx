import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';

const HomePage = lazy(() => import('./pages/HomePage').then((module) => ({ default: module.HomePage })));
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((module) => ({ default: module.InventoryPage })),
);
const AddItemPage = lazy(() =>
  import('./pages/AddItemPage').then((module) => ({ default: module.AddItemPage })),
);
const HistoryPage = lazy(() =>
  import('./pages/HistoryPage').then((module) => ({ default: module.HistoryPage })),
);
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

export default function App() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <Box sx={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={30} />
          </Box>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/add" element={<AddItemPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}
