/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
const blockminerOrigin =
  String(process.env.VITE_BLOCKMINER_ORIGIN || '').trim() ||
  (process.env.NODE_ENV === 'production' ? 'https://blockminer.space' : 'http://localhost:5173')

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    coverage: {
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
      }
    }
  }
})
