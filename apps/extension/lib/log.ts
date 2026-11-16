/**
 * Diagnostics ring buffer, shared by every extension context (service
 * worker, injected relay, grant page, options page): all of them have
 * `chrome.storage` and write namespaced entries into one `finai.log` array
 * that the Options page renders. Concurrent writes can race and drop an
 * entry — acceptable for diagnostics; the page reads whatever survived.
 */
export const LOG_KEY = 'finai.log'

export type LogEvent = { at: string; kind: string; detail?: Record<string, unknown> }

export async function appendLog(prefix: string, kind: string, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(LOG_KEY)
    const events = (stored[LOG_KEY] as LogEvent[]) ?? []
    events.push({ at: new Date().toISOString(), kind: `${prefix}:${kind}`.replace(/^::/, ''), detail })
    await chrome.storage.local.set({ [LOG_KEY]: events.slice(-80) })
  } catch {
    // logging must never itself break the flow
  }
}
