import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The Capabble design system (tokens + kit styles) lives with the school app's UI kit.
      '@capabble/design': path.resolve(__dirname, '../client/src/styles/capabble'),
      '@capabble/brand': path.resolve(__dirname, '../client/src/assets'),
      // Module codes, names and icons, shared with the school app's module switcher.
      '@capabble/modules': path.resolve(__dirname, '../client/src/constants/moduleRegistry.ts'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: process.env.ADMIN_API_PROXY || 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
