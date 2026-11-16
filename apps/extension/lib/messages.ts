import { APP_TAB_MATCHES } from './app-origins'
import type { PairingPayload } from 'shared-types'

export { APP_TAB_MATCHES }

// App-visible bridge messages (window.postMessage between the FinAI app and
// the app-origin content script) are typed by shared-types' BridgeMessage.



/** App tab → service worker (relayed to the page via app.content.ts). */
export type PairMessage = { type: 'pair'; payload: PairingPayload }
export type StartSyncMessage = { type: 'start-sync'; connectionId: string; originPattern: string }
export type CancelSyncMessage = { type: 'cancel-sync'; connectionId: string }
export type GetSessionMessage = { type: 'get-session' }
/** The grant page confirmed new origin patterns (comma list completed in the extension page). */
export type GrantDoneMessage = { type: 'grant-done'; grantedOrigins: string[] }

/** Bank tab ↔ service worker (the passive capture daemon). */
export type CaptureCsvMessage = { type: 'capture-csv'; csvBase64: string; filename: string }

export type WorkerMessage =
  | PairMessage
  | StartSyncMessage
  | CancelSyncMessage
  | GetSessionMessage
  | GrantDoneMessage
  | CaptureCsvMessage
