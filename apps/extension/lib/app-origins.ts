/**
 * Origins the FinAI↔extension bridge runs on — the single source of truth,
 * used by the manifest (content script + host permissions) and every
 * "find the app tab" query.
 *
 * Deployments add their app origin via the APP_ORIGIN env at extension build
 * time (e.g. `APP_ORIGIN=https://finai.example.com pnpm --filter extension run build`);
 * the localhost entries always ship so local development keeps working.
 */
const APP_ORIGIN = process.env.APP_ORIGIN?.replace(/\/$/, '')
if (APP_ORIGIN && !APP_ORIGIN.startsWith('https://')) throw new Error(`APP_ORIGIN must be an https URL: ${APP_ORIGIN}`)

export const APP_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', ...(APP_ORIGIN ? [APP_ORIGIN] : [])]

export const APP_TAB_MATCHES = APP_ORIGINS.map((origin) => `${origin}/*`)
