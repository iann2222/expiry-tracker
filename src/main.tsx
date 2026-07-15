import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { CssBaseline, ThemeProvider, useMediaQuery } from '@mui/material';
import App from './App';
import { TaipeiClockProvider } from './context/TaipeiClockContext';
import { ensureDatabaseDefaults } from './data/database';
import { usePreferences } from './hooks/useAppData';
import { createAppTheme } from './theme';
import './index.css';

if (window.isSecureContext && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

function AppRoot() {
  const preferences = usePreferences();
  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolvedMode =
    preferences.themeMode === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : preferences.themeMode;
  const theme = useMemo(() => createAppTheme(resolvedMode), [resolvedMode]);

  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolvedMode === 'dark' ? '#101816' : '#1F6657');
  }, [resolvedMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <TaipeiClockProvider>
        <HashRouter>
          <App />
        </HashRouter>
      </TaipeiClockProvider>
    </ThemeProvider>
  );
}

async function bootstrap() {
  const root = createRoot(document.getElementById('root')!);

  try {
    await ensureDatabaseDefaults();
    root.render(
      <StrictMode>
        <AppRoot />
      </StrictMode>,
    );
  } catch (error) {
    console.error('App initialization failed', error);
    root.render(
      <main
        style={{
          maxWidth: 520,
          margin: '48px auto',
          padding: 24,
          fontFamily: 'system-ui, sans-serif',
          color: '#20302c',
        }}
      >
        <h1 style={{ fontSize: 24 }}>效期管理無法啟動</h1>
        <p>本機資料初始化失敗，請重新整理頁面；若問題持續，請將下方訊息提供給開發者。</p>
        <pre style={{ whiteSpace: 'pre-wrap', padding: 16, borderRadius: 12, background: '#eef3ef' }}>
          {error instanceof Error ? error.message : String(error)}
        </pre>
      </main>,
    );
  }
}

void bootstrap();
