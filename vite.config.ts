import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'vite-bundle-analyzer';
import path from 'path';

// https://vitejs.dev/config/
const plugins: PluginOption[] = [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Regis Matrix Lab',
        short_name: 'Regis Matrix',
        lang: 'pl',
        theme_color: '#00ff41',
        background_color: '#0a1f0a',
        display: 'standalone',
        icons: [
          {
            src: '/favicon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
          },
        ],
      },
    }),
    process.env.ANALYZE ? visualizer({ open: true }) : undefined,
  ].filter(Boolean) as PluginOption[];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          animations: ['framer-motion'],
          state: ['zustand'],
        },
      },
    },
  },
});
