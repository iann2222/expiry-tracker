import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  const base = '/expiry-tracker/';

  return {
    base,
  server: {
    host: '0.0.0.0',
    port: 2222,
    strictPort: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 2222,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@mui') || id.includes('@emotion')) return 'mui';
          if (id.includes('dexie')) return 'database';
          if (
            id.includes('/node_modules/react/') ||
            id.includes('/node_modules/react-dom/') ||
            id.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }
          return undefined;
        },
      },
    },
  },
    plugins: [
      react(),
      VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['app-icon.svg'],
      manifest: {
        id: base,
        name: '效期管理',
        short_name: '效期管理',
        description: '離線優先的家庭食品庫存與效期管理工具',
        lang: 'zh-TW',
        start_url: `${base}#/`,
        scope: base,
        display: 'standalone',
        background_color: '#F5F7F3',
        theme_color: '#1F6657',
        orientation: 'portrait-primary',
        icons: [
          {
            src: `${base}app-icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: `${base}app-icon.svg`,
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html'
      }
      }),
    ],
  };
});
