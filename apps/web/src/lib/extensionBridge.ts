import type { BridgeMessage, PairingPayload } from 'shared-types'
import { supabase } from './supabaseClient'

/**
 * App ⇄ extension bridge (window.postMessage, namespace-keyed, same-origin
 * only). The extension's content script lives on this page's origins and
 * relays to the service worker. This side never stores anything sensitive —
 * tokens exist only for the pairing moment, in-flight, same device.
 */

const BRIDGE_KEY = 'finai-bridge'

type Listener = (message: BridgeMessage) => void
const listeners = new Set<Listener>()
let installed = false

function apiBaseUrl(): string {
  // Resolve to an absolute URL: the extension fetches it from its own
  // extension:// context, so a '/api'-style default must become origin-qualified.
  const configured = import.meta.env.VITE_API_BASE_URL ?? '/api'
  return new URL(configured, window.location.origin).toString().replace(/\/$/, '')
}

async function pairingPayload(): Promise<PairingPayload | null> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return null
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null
  return {
    apiBaseUrl: apiBaseUrl(),
    supabaseUrl,
    supabaseAnonKey,
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
  }
}

async function postToExtension(message: BridgeMessage) {
  window.postMessage({ [BRIDGE_KEY]: true, message }, window.location.origin)
}

/** Pairs whenever the extension announces itself (page load, extension reload). */
export async function pairExtension() {
  const payload = await pairingPayload()
  if (!payload) return
  await postToExtension({ kind: 'finai:pair', payload })
}

export function sendToBridge(message: BridgeMessage) {
  void postToExtension(message)
}

export function subscribeToBridge(listener: Listener): () => void {
  if (!installed) {
    installed = true
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin || event.source !== window) return
      const data = event.data as Record<string, unknown> | null
      if (!data || typeof data !== 'object' || data[BRIDGE_KEY] !== true) return
      try {
        const message = (data as { message: BridgeMessage }).message
        listeners.forEach((listener) => listener(message))
      } catch {
        // message outside our schema — ignore
      }
    })
  }
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Live status per connection while a sync runs in the extension. */
export type SyncStatus = {
  connectionId: string
  accountId: string
  status: 'waiting' | 'capturing' | 'complete' | 'failed' | 'cancel'
  stepLabel: string
  errorMessage: string | null
  uploadedFileId: string | null
  fileName: string
}
