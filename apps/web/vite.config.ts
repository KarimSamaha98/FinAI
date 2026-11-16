import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Dev-only mock: a one-time-token CSV export (like EQ Bank's). The browser
    // download succeeds once; any re-fetch (extension retry) gets an error
    // JSON — forcing the disk-read capture channel in the E2E.
    {
      name: 'mock-onetime-export',
      configureServer(server) {
        const served = new Set<string>()
        server.middlewares.use('/mock-onetime.csv', (req, res, next) => {
          const url = new URL(req.url ?? '', 'http://x')
          const token = url.searchParams.get('token') ?? ''
          if (!token) return next()
          if (served.has(token)) {
            res.statusCode = 403
            res.setHeader('Content-Type', 'application/json')
            res.end('{"error":"export link already used"}')
            return
          }
          served.add(token)
          res.setHeader('Content-Type', 'text/csv')
          res.setHeader('Content-Disposition', 'attachment; filename="one-time-export.csv"')
          res.end('Date,Description,Debit,Credit\n2026-11-05,ONE TIME EXPORT,10.00,\n2026-11-04,ONE TIME DEPOSIT,,25.00')
        })
      },
    },
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
    // Vite 8 rejects unexpected Host headers; let the extension E2E replay
    // the "bank redirects to another domain" flow through fake test hosts
    // (mapped to 127.0.0.1 by Chrome's --host-resolver-rules).
    allowedHosts: ['mock-cibc.test', 'mock-cibconline.test', 'www.mock-bank.test', 'online.mock-bank.test'],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
