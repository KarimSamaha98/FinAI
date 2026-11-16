import { APP_ORIGINS } from '../lib/app-origins'
import { BridgeMessageSchema, type BridgeMessage, type PairingPayload } from 'shared-types'
import type { WorkerMessage } from '../lib/messages'

/**
 * Bridge between the FinAI web app and the service worker. This content
 * script runs only on the app's own origins:
 *
 *   app page ⇄ window.postMessage ⇄ here ⇄ chrome.runtime ⇄ service worker
 *
 * Pairing (app → extension) sends the runtime config + current session
 * tokens across this bridge — the only place token-like data ever moves, and
 * it stays on the user's own device.
 */

const BRIDGE_KEY = 'finai-bridge'

function postBridge(message: BridgeMessage) {
  window.postMessage({ [BRIDGE_KEY]: true, message }, window.location.origin)
}

function isValidBridgeEvent(event: MessageEvent): BridgeMessage | null {
  if (event.source !== window) return null
  if (event.origin !== window.location.origin) return null
  const data = event.data as Record<string, unknown> | null
  if (!data || typeof data !== 'object' || data[BRIDGE_KEY] !== true) return null
  const parsed = BridgeMessageSchema.safeParse(data['message'])
  return parsed.success ? parsed.data : null
}

export default defineContentScript({
  matches: APP_ORIGINS.map((origin) => `${origin}/*`),
  main() {
    chrome.runtime.onMessage.addListener((relay: unknown, _sender, sendResponse) => {
      // Service worker → app page (sync statuses, pairing acks)
      const parsed = BridgeMessageSchema.safeParse(relay)
      if (parsed.success) {
        postBridge(parsed.data)
        sendResponse({ ok: true })
      }
      return false
    })

    window.addEventListener('message', (event) => {
      const message = isValidBridgeEvent(event)
      if (!message) return
      switch (message.kind) {
        case 'finai:pair': {
          void (async () => {
            const payload: PairingPayload = message.payload
            const response = (await chrome.runtime.sendMessage({ type: 'pair', payload } satisfies WorkerMessage)) as { ok?: boolean; error?: string } | undefined
            if (response?.ok) {
              postBridge(BridgeMessageSchema.parse({ kind: 'finai:pairing-accepted' }))
            } else {
              postBridge(BridgeMessageSchema.parse({ kind: 'finai:pair-error', errorMessage: response?.error ?? 'Pairing failed' }))
            }
          })()
          break
        }
        case 'finai:start-sync': {
          void chrome.runtime.sendMessage({
            type: 'start-sync',
            connectionId: message.connectionId,
            originPattern: message.originPattern,
          } satisfies WorkerMessage)
          break
        }
        case 'finai:cancel-sync': {
          void chrome.runtime.sendMessage({ type: 'cancel-sync', connectionId: message.connectionId } satisfies WorkerMessage)
          break
        }
        default:
          // Extension → app messages are outgoing only: bridge-ready,
          // pairing-accepted, pair-error, sync-status, not-installed.
          break
      }
    })

    // Announce presence so the app can detect the extension immediately.
    postBridge(BridgeMessageSchema.parse({ kind: 'finai:bridge-ready' }))
  },
})
