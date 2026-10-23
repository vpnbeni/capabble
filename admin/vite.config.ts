import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // Installable app; src/UpdatePrompt.tsx registers the service worker.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'pwa/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Capabble Platform Admin',
        short_name: 'Capabble Admin',
        description: 'Manage Capabble workspaces, onboarding and billing.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#111314',
        theme_color: '#111314',
        icons: [
          { src: '/pwa/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}', 'pwa/*.png'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Page loads ask the server first so a plain reload gets the latest deploy;
        // the cached shell is only the offline fallback.
        navigateFallback: null,
        directoryIndex: null,
        runtimeCaching: [
          {
            urlPattern: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 10 },
              precacheFallback: { fallbackURL: 'index.html' },
            },
          },
        ],
      },
    }),
  ],
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
