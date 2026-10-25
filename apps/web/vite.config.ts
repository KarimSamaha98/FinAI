import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Frugal AI',
        short_name: 'Frugal AI',
        description: 'Personal finance and budgeting tracker',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              !sameOrigin || url.pathname.startsWith('/api/transactions') || url.pathname.startsWith('/api/reporting'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'finai-api-cache',
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Bind to all interfaces so the dev server is reachable from a phone on
    // the same Wi-Fi (e.g. http://<mac-ip>:5173).
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
