// Vite build of the app for the Windows desktop (Tauri, src-tauri/): the same React code as the macOS app, on
// react-native-web. `react-native` resolves to web/react-native.tsx, and a module's `.web.ts(x)` twin wins over it
// (src/native/*.web.ts hold the Windows side of the native modules). Run: npm run web:dev / npm run tauri:dev.
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const appRoot = __dirname;
const coreRoot = path.resolve(appRoot, '../../packages/gp-core');

export default defineConfig(({ mode }) => ({
  root: path.resolve(appRoot, 'web'),
  base: './',
  plugins: [react()],
  resolve: {
    extensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.mjs', '.json'],
    alias: [
      { find: /^react-native$/, replacement: path.resolve(appRoot, 'web/react-native.tsx') },
      { find: /^@gp-editor\/core$/, replacement: path.resolve(coreRoot, 'src/index.ts') },
    ],
  },
  define: {
    // react-native-web and React read these.
    'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    __DEV__: JSON.stringify(mode !== 'production'),
  },
  server: {
    port: 1420,
    strictPort: true,
    fs: { allow: [appRoot, coreRoot, path.resolve(appRoot, 'node_modules')] },
  },
  build: {
    outDir: path.resolve(appRoot, 'web-dist'),
    emptyOutDir: true,
    // WebView2 is evergreen Chromium.
    target: 'chrome120',
    chunkSizeWarningLimit: 4096,
  },
  optimizeDeps: {
    esbuildOptions: { resolveExtensions: ['.web.tsx', '.web.ts', '.tsx', '.ts', '.web.js', '.js', '.mjs', '.json'] },
  },
}));
