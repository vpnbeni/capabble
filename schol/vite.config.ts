import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiTarget = process.env.VITE_SCHOL_API_URL || 'http://localhost:8001'
const scholPort = Number(process.env.VITE_SCHOL_PORT || 5175)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: scholPort,
    // schol.capabble.localhost resolves to 127.0.0.1 without a hosts file (Chrome/Edge/Firefox).
    // schol.capabble requires scripts/setup-local-host.ps1 (Windows) or /etc/hosts entry.
    allowedHosts: ['schol.capabble.localhost', 'schol.capabble'],
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})
