import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import SpaRoundedIcon from '@mui/icons-material/SpaRounded';
import {
  Alert,
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  Container,
  Paper,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTaipeiClock } from '../context/TaipeiClockContext';

const navigationItems = [
  { path: '/', label: '首頁', icon: <HomeRoundedIcon /> },
  { path: '/inventory', label: '庫存', icon: <Inventory2RoundedIcon /> },
  { path: '/add', label: '新增', icon: <AddCircleRoundedIcon /> },
  { path: '/history', label: '歷史', icon: <HistoryRoundedIcon /> },
  { path: '/settings', label: '設定', icon: <SettingsRoundedIcon /> },
];

const pageTitles: Record<string, string> = {
  '/': '今天先吃什麼？',
  '/inventory': '庫存',
  '/add': '新增商品',
  '/history': '異動紀錄',
  '/settings': '偏好設定',
};

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { deviceIsUtc8 } = useTaipeiClock();

  return (
    <Box sx={{ minHeight: '100vh', pb: 'calc(92px + env(safe-area-inset-bottom))' }}>
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          bgcolor: (theme) => alpha(theme.palette.background.default, 0.88),
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Container maxWidth="sm" disableGutters>
          <Toolbar sx={{ minHeight: { xs: 72 }, px: { xs: 2, sm: 3 } }}>
            <Stack direction="row" spacing={1.5} sx={{ flex: 1, alignItems: 'center' }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  display: 'grid',
                  placeItems: 'center',
                  color: 'primary.contrastText',
                  bgcolor: 'primary.main',
                  borderRadius: '14px',
                }}
              >
                <SpaRoundedIcon />
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  效期管理
                </Typography>
                <Typography variant="h3">{pageTitles[location.pathname] ?? '效期管理'}</Typography>
              </Box>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="sm" sx={{ px: { xs: 2, sm: 3 }, pt: 2.5 }}>
        {!deviceIsUtc8 && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            裝置目前不是 UTC+8；所有日期與到期判定仍固定使用 Asia/Taipei（UTC+8）。
          </Alert>
        )}
        {children}
      </Container>

      <Paper
        elevation={0}
        sx={{
          position: 'fixed',
          zIndex: 20,
          left: '50%',
          bottom: 0,
          transform: 'translateX(-50%)',
          width: '100%',
          maxWidth: 600,
          pb: 'env(safe-area-inset-bottom)',
          borderRadius: { xs: '22px 22px 0 0', sm: '22px 22px 0 0' },
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
        }}
      >
        <BottomNavigation
          showLabels
          value={location.pathname}
          onChange={(_, path: string) => navigate(path)}
          sx={{ height: 72, bgcolor: 'background.paper' }}
        >
          {navigationItems.map((item) => (
            <BottomNavigationAction
              key={item.path}
              value={item.path}
              label={item.label}
              icon={item.icon}
              sx={
                item.path === '/add'
                  ? {
                      color: 'primary.main',
                      '& .MuiSvgIcon-root': { fontSize: 31 },
                    }
                  : undefined
              }
            />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
