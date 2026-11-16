function el(id: string): HTMLElement | null {
  return document.getElementById(id)
}

const OK_KINDS = new Set(['paired', 'permission-granted', 'download-observed', 'capture-ok', 'upload-ok', 'relay-capture'])
const BAD_KINDS = new Set(['unhandledrejection', 'worker-error', 'injection-failed', 'upload-failed'])

function renderState(state: { paired?: boolean; session?: boolean; origins?: string[]; extensionError?: string }) {
  const host = el('state')
  if (!host) return
  const rules = (ok: boolean | undefined) => `<span class="${ok ? 'ok' : 'bad'}">${ok ? 'yes' : 'no'}</span>`
  host.innerHTML = [
    `Paired with Frugal AI: ${rules(state.paired)}`,
    `Sync running right now: ${rules(state.session)}`,
    `Origins with capture permission: ${(state.origins ?? []).map((origin) => `<code>${origin}</code>`).join(', ') || '<span class="warn">none</span>'}`,
    state.extensionError ? `<span class="bad">Service worker error: ${escapeHtml(state.extensionError)}</span>` : '',
  ]
    .filter(Boolean)
    .join('<br />')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)
}

function renderLog(events: Array<{ at: string; kind: string; detail?: Record<string, unknown> }>) {
  const host = el('log')
  if (!host) return
  if (events.length === 0) {
    host.innerHTML = '<li><span class="detail">No events yet — start a sync in Frugal AI and come back here.</span></li>'
    return
  }
  host.innerHTML = events
    .map((event) => {
      const cssClass = OK_KINDS.has(event.kind) ? ' ok-rule' : BAD_KINDS.has(event.kind) ? ' bad-rule' : ''
      const time = event.at.slice(11, 23)
      const detail = event.detail && Object.keys(event.detail).length > 0 ? Object.entries(event.detail).map(([key, value]) => `${key}: ${String(value)}`).join(' · ') : ''
      return `<li><span class="time">${time}</span><span class="kind${cssClass}">${escapeHtml(event.kind)}</span><span class="detail">${escapeHtml(detail)}</span></li>`
    })
    .join('')
}

async function refresh() {
  const log = await chrome.storage.local.get('finai.log')
  renderLog((log['finai.log'] as Array<{ at: string; kind: string; detail?: Record<string, unknown> }>) ?? [])

  const session = await chrome.storage.session.get('finai.activeSession')
  const active = session['finai.activeSession'] as { origin?: string; loginUrl?: string } | undefined

  const permissions = await chrome.permissions.getAll()
  const granted = (permissions.origins ?? []).map(String)

  renderState({
    paired: Object.keys(await chrome.storage.local.get('finai.auth')).length > 0,
    session: active !== undefined,
    origins: granted,
  })
}

el('refresh')?.addEventListener('click', () => void refresh())
el('clear')?.addEventListener('click', async () => {
  await chrome.storage.local.set({ 'finai.log': [] })
  void refresh()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['finai.log']) void refresh()
})

void refresh()
