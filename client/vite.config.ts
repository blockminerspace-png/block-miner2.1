/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Docker frontend stage copies engine here; dev prefers built `dist/server`, then TS source. */
const game2048EngineEntry =
  [
    path.resolve(__dirname, 'engine/game2048Engine.js'),
    path.resolve(__dirname, '../dist/server/services/game2048Engine.js'),
    path.resolve(__dirname, '../server/services/game2048Engine.ts'),
  ].find((p) => fs.existsSync(p)) ?? path.resolve(__dirname, '../dist/server/services/game2048Engine.js');

const blockminerOrigin =
  String(process.env.VITE_BLOCKMINER_ORIGIN || '').trim() ||
  (process.env.NODE_ENV === 'production' ? 'https://blockminer.space' : 'http://localhost:5173');

/** CI `npm run coverage:gate`: line coverage ≥80% on utils modules that have dedicated unit tests. */
const coverageGate = process.env.COVERAGE_GATE === '1';
const coverageGateIncludes = [
  'src/shared/utils/calculatorEngine.ts',
  'src/shared/utils/csrfHeader.ts',
  'src/shared/utils/depositChannel.ts',
  'src/shared/utils/eip1193ProviderEvents.ts',
  'src/shared/utils/inventoryRackUtils.ts',
  'src/shared/utils/inventoryStackKey.ts',
  'src/shared/utils/sidebarPathMatch.ts',
  'src/shared/utils/walletSessionPreference.ts',
  'src/pages/admin/adminInternalOfferwallValidate.ts',
  'src/shared/utils/sidebarNavMap.ts',
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@game2048/engine': game2048EngineEntry,
    },
  },
  test: {
    environment: 'jsdom',
    coverage: coverageGate
      ? {
          provider: 'v8',
          reporter: ['text', 'json-summary'],
          reportsDirectory: './coverage',
          include: coverageGateIncludes,
          exclude: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/**/__mocks__/**'],
          thresholds: {
            lines: 80,
          },
        }
      : {
          provider: 'v8',
          reporter: ['text', 'json-summary', 'html', 'lcov'],
          reportsDirectory: './coverage',
          include: ['src/**/*.{js,jsx,ts,tsx}'],
          exclude: ['src/**/*.test.{js,jsx,ts,tsx}', 'src/**/__mocks__/**'],
        },
  },
  define: {
    'process.env.APP_URL': JSON.stringify(blockminerOrigin),
  },
  // Use content hashes (Vite default), NOT a new timestamp every build — otherwise stale
  // cached index.html points at deleted JS after deploy → white screen for many users.
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
});
