import { defineConfig } from 'wxt'
import { APP_ORIGINS } from './lib/app-origins'

// Bank origins are granted per-connection at runtime
// (optional_host_permissions) so the install-time footprint stays tiny. App
// origins (bridge content script + host permissions) come from lib/app-origins.

export default defineConfig({
  // Visible (non-dot) output dir so "Load unpacked" in Chrome's file picker
  // doesn't require showing hidden files; covered by the root `dist/` ignore.
  outDir: 'dist',
  // Statically inline APP_ORIGIN — `process` is undefined in MV3 service
  // workers, and a module-scope `process.env.X` reference crashes the worker
  // at startup (observed: silent extension death, no pairing).
  vite: () => ({
    define: {
      'process.env.APP_ORIGIN': JSON.stringify(process.env.APP_ORIGIN ?? ''),
    },
  }),
  manifest: {
    name: 'FinAI Bank Sync',
    description:
      'Capture your bank’s CSV transaction exports for Frugal AI. You always sign in yourself — the extension only records clicks and downloads the CSV.',
    permissions: ['storage', 'tabs', 'scripting', 'downloads', 'alarms'],
    optional_host_permissions: ['*://*/*'],
    host_permissions: [...APP_ORIGINS.map((origin) => `${origin}/*`), 'file:///*'],
  },
})
