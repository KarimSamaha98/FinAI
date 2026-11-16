import { appendLog } from '../../lib/log'
import type { WorkerMessage } from '../../lib/messages'

/** Page-side diagnostics: the grant page logs its own progress into the
 * shared log (chrome.storage.local works from extension pages even when the
 * service worker is idle), so a hung permissions.request is visible. */
const grantLog = (kind: string, detail: Record<string, unknown> = {}) => appendLog('grant', kind, detail)

const params = new URLSearchParams(document.location.search)
void grantLog('page-opened', { origins: (params.get('origins') ?? '').slice(0, 120) })
// One or more origin patterns (comma list) — the pasted origin plus its
// domain family, or the family of a domain the bank redirected to mid-sync.
const originPatterns = (params.get('origins') ?? params.get('origin') ?? '')
  .split(',')
  .map((pattern) => pattern.trim())
  .filter(Boolean)

const originLabel = document.getElementById('origin')
if (originLabel) originLabel.textContent = originPatterns.join(' + ')

function markDone() {
  const done = document.getElementById('done')
  if (done) done.hidden = false
}

document.getElementById('grant')?.addEventListener('click', () => {
  if (originPatterns.length === 0) return
  // NOTE: no async work before chrome.permissions.request — an awaited
  // storage write here consumes the user-gesture state and Chrome hangs the
  // request forever (observed). Log only after it resolves.
  void chrome.permissions.request({ origins: originPatterns }).then((granted) => {
    void grantLog('request-resolved', { granted, patterns: originPatterns.join(',').slice(0, 120) })
    if (granted) {
      markDone()
      void chrome.runtime.sendMessage({ type: 'grant-done', grantedOrigins: originPatterns } satisfies WorkerMessage)
      window.close()
    }
  }).catch((error) => {
    void grantLog('request-failed', { message: error instanceof Error ? error.message : String(error).slice(0, 160) })
  })
})

document.getElementById('close')?.addEventListener('click', () => window.close())

// Readiness signal for automation (and any future in-app grant UX): the
// click listeners above are attached only once this is set.
;(window as unknown as Record<string, boolean>)['__finaiGrantReady'] = true
