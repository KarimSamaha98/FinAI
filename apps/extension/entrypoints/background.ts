import { BridgeMessageSchema, PairingPayloadSchema } from 'shared-types'
import { APP_TAB_MATCHES, type WorkerMessage } from '../lib/messages'

/**
 * Service worker. Holds the paired auth config and runs one sync session at
 * a time:
 *
 *   "Sync now" → open the bank sign-on URL in a popup → inject the passive
 *   capture hook + relay daemon → the *user* signs in and downloads the CSV
 *   themselves → the download is captured (blob hook or downloads.onCreated
 *   → same-origin fetch), uploaded to the API via the existing import run
 *   upload endpoint → the popup closes and the app is told to open the
 *   import review.
 *
 * The session is persisted in chrome.storage.session (MV3 kills an idle
 * service worker after ~30s; bank sign-ons take longer). Tokens live in
 * storage.local. There is no recording, no recipe, no replaying — the only
 * automation is opening the tab and watching for one CSV download.
 */

type StoredAuth = {
  apiBaseUrl: string
  supabaseUrl: string
  supabaseAnonKey: string
  accessToken: string
  refreshToken: string
}

const AUTH_KEY = 'finai.auth'
const SESSION_KEY = 'finai.activeSession'
const PENDING_START_KEY = 'finai.pendingStart'

type Connection = {
  id: string
  accountId: string
  bankSlug: string
  loginUrl: string
  status: string
}

type Session = {
  connectionId: string
  accountId: string
  loginUrl: string
  /**
   * Origins capture may operate on, starting with the pasted sign-on URL's
   * origin and growing as the user allows redirected bank domains (banks
   * commonly hop domains mid-flow: CIBC's cibc.ca → cibconline.cibc.com).
   * Scoped per-domain consent — never a broad all-https wildcard.
   */
  origins: string[]
  windowId: number | null
  startedAt: number
  /** one capture per session — later channels (hook relay, downloads.fetch) lose. */
  captured?: boolean
  /** Mid-flow redirect domains the grant page was already opened for (no repeats). */
  grantsRequested?: string[]
  /** Download candidates observed this session (Chrome writes them to ~/Downloads). */
  downloads?: Array<{ id: number; filename: string; url: string }>
  /** One-time "enable file access" nudge shown after a failed disk read. */
  fileAccessHintShown?: boolean
}

const SESSION_IDLE_TIMEOUT_MS = 15 * 60 * 1000

// Surface worker crashes in the Options diagnostics instead of dying silently.
if (typeof window === 'undefined') {
  try {
    self.addEventListener('unhandledrejection', (event) => {
      void logEvent('unhandledrejection', { message: String((event as PromiseRejectionEvent).reason).slice(0, 300) })
    })
    self.addEventListener('error', (event) => {
      void logEvent('worker-error', { message: String((event as ErrorEvent).message).slice(0, 300) })
    })
  } catch {
    // non-MV3 contexts
  }
}

// ---------------------------------------------------------------------------
// storage: auth + persisted session
// ---------------------------------------------------------------------------

async function getAuth(): Promise<StoredAuth | null> {
  const stored = await chrome.storage.local.get(AUTH_KEY)
  return (stored[AUTH_KEY] as StoredAuth | undefined) ?? null
}

async function refreshAccessToken(): Promise<boolean> {
  const auth = await getAuth()
  if (!auth) return false
  try {
    const response = await fetch(`${auth.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: auth.supabaseAnonKey },
      body: JSON.stringify({ refresh_token: auth.refreshToken }),
    })
    if (!response.ok) return false
    const data = (await response.json()) as { access_token?: string; refresh_token?: string }
    if (!data.access_token) return false
    await chrome.storage.local.set({
      [AUTH_KEY]: { ...auth, accessToken: data.access_token, refreshToken: data.refresh_token ?? auth.refreshToken },
    })
    return true
  } catch {
    return false
  }
}

async function api(path: string, init?: { method?: string; body?: FormData | string }): Promise<Response> {
  const auth = await getAuth()
  if (!auth) throw new Error('Not paired with Frugal AI yet')
  const headers: Record<string, string> = { Authorization: `Bearer ${auth.accessToken}` }
  const body = init?.body
  if (typeof body === 'string') headers['Content-Type'] = 'application/json'
  const response = await fetch(`${auth.apiBaseUrl}${path}`, { ...init, headers, body })
  if (response.status === 401 && (await refreshAccessToken())) {
    const refreshed = await getAuth()
    if (refreshed) {
      return fetch(`${auth.apiBaseUrl}${path}`, {
        ...init,
        headers: { ...headers, Authorization: `Bearer ${refreshed.accessToken}` },
        body,
      })
    }
  }
  return response
}

/**
 * The session must outlive the service worker: MV3 kills an idle worker
 * after ~30s and users take a while to sign in. Every handler hydrates from
 * storage when the in-memory copy is gone.
 */
let session: Session | null = null

async function persistSession() {
  if (session) await chrome.storage.session.set({ [SESSION_KEY]: session })
  else await chrome.storage.session.remove(SESSION_KEY)
}

async function hydrateSession(): Promise<Session | null> {
  if (session) return session
  const stored = await chrome.storage.session.get(SESSION_KEY)
  const value = stored[SESSION_KEY] as Session | undefined
  if (value) {
    // Sessions persisted before origins[] existed carry a single `origin`.
    if ('origin' in value && !Array.isArray(value.origins)) value.origins = [(value as unknown as { origin: string }).origin]
    session = value
  }
  return session
}

/**
 * Diagnostics ring buffer (Options page shows it): every meaningful stage —
 * session start, download observed/rejected, capture, upload errors — so a
 * silent miss is readable instead of invisible.
 */
const LOG_KEY = 'finai.log'

async function logEvent(kind: string, detail: Record<string, unknown> = {}) {
  try {
    const stored = await chrome.storage.local.get(LOG_KEY)
    const events = (stored[LOG_KEY] as Array<{ at: string; kind: string; detail?: Record<string, unknown> }>) ?? []
    events.push({ at: new Date().toISOString(), kind, detail })
    await chrome.storage.local.set({ [LOG_KEY]: events.slice(-80) })
  } catch {
    // logging must never itself break the flow
  }
}

// ---------------------------------------------------------------------------
// app tab relay (visible status + navigation to the import review; capture
// and upload work with the app tab closed)
// ---------------------------------------------------------------------------

function bridgeStatus(
  connectionId: string,
  status: 'waiting' | 'capturing' | 'complete' | 'failed' | 'cancel',
  extra: { accountId?: string; message?: string; errorMessage?: string | null; uploadedFileId?: string | null; fileName?: string } = {},
) {
  void (async () => {
    const tabs = await chrome.tabs.query({ url: APP_TAB_MATCHES })
    for (const tab of tabs) {
      if (tab.id === undefined) continue
      try {
        await chrome.tabs.sendMessage(
          tab.id,
          BridgeMessageSchema.parse({
            kind: 'finai:sync-status',
            connectionId,
            accountId: extra.accountId ?? '',
            status,
            message: extra.message ?? '',
            errorMessage: extra.errorMessage ?? null,
            uploadedFileId: extra.uploadedFileId ?? null,
            fileName: extra.fileName ?? '',
          }),
        )
      } catch {
        // app tab closed or no bridge — capture/upload still proceed
      }
    }
  })()
}

// ---------------------------------------------------------------------------
// sync session: open the bank tab, watch for its CSV download
// ---------------------------------------------------------------------------

/**
 * Permission patterns for an origin: the exact origin plus a wildcard over
 * the registrable domain — pasting the URL the user knows (cibc.com or
 * www.cibconline.cibc.com) covers every subdomain, including where the bank
 * serves sign-on. One grant ever; mid-flow prompts don't exist.
 *
 * Port-pinned hosts (localhost etc.) and IPs use just the exact origin —
 * Chrome wildcard patterns can't carry ports.
 */

/** Multi-part public suffixes worth handling beyond the two-label rule. */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk',
  'com.au', 'net.au', 'org.au',
  'co.jp', 'ne.jp', 'or.jp',
  'co.nz', 'co.za', 'com.br', 'com.mx', 'com.ar', 'co.in', 'co.kr', 'com.sg', 'com.hk', 'com.tr',
])

function registrableDomain(hostname: string): string {
  const labels = hostname.split('.')
  if (labels.length < 2) return hostname
  const lastTwo = labels.slice(-2).join('.')
  if (MULTI_PART_SUFFIXES.has(lastTwo) && labels.length >= 3) return labels.slice(-3).join('.')
  return lastTwo
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Is this origin inside the extension's granted host permissions (wildcards included)? */
async function originGranted(origin: string): Promise<boolean> {
  try {
    return await chrome.permissions.contains({ origins: [`${origin}/*`] })
  } catch {
    return false
  }
}

function domainFamilyPatterns(origin: string): string[] {
  try {
    const url = new URL(origin)
    const host = url.hostname
    const exact = `${origin}/*`
    const wildcardable =
      host !== 'localhost' &&
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin.replace(/^[a-z]+:\/\//, '')) &&
      !/^(\d{1,3}\.){3}\d{1,3}$/.test(host) &&
      host.includes('.')
    if (!wildcardable) return [exact]
    return [exact, `${url.protocol}//*.${registrableDomain(host)}/*`]
  } catch {
    return []
  }
}

async function startSync(msg: { connectionId: string; originPattern: string }) {
  const previous = await hydrateSession()
  if (previous) {
    bridgeStatus(previous.connectionId, 'cancel', { errorMessage: 'A newer sync was started' })
    endSessionPopup()
    session = null
    await persistSession()
  }
  // Banks legitimately redirect between the domain you pasted and their
  // actual banking host, so ask for the family up-front.
  const family = domainFamilyPatterns(msg.originPattern.replace(/\/\*$/, ''))
  const hasPermission = family.length > 0 && (await chrome.permissions.contains({ origins: family }))
  await logEvent('start-sync', { connectionId: msg.connectionId, originPattern: msg.originPattern, family, permissionGranted: hasPermission })
  if (!hasPermission) {
    // chrome.permissions.request must run from a user gesture inside the
    // extension itself, so confirmation happens in the grant page; the page
    // requests the whole family in one dialog. The sync continues by itself
    // after the grant (no second click).
    await chrome.storage.session.set({
      [PENDING_START_KEY]: { connectionId: msg.connectionId, originPattern: msg.originPattern },
    })
    // The grant is a small focused popup window — permission first, the bank
    // popup opens the moment access is granted (grant-done → pending-start).
    // Note: chrome.windows.create from a service worker can LIE about
    // width/height in its result (the window lays out at full size anyway),
    // so the real bounds are verified via windows.get and re-asserted.
    const grantWindow = await chrome.windows.create({
      url: `${chrome.runtime.getURL('grant.html')}?origins=${encodeURIComponent(family.join(','))}&connectionId=${encodeURIComponent(msg.connectionId)}`,
      type: 'popup',
      width: 420,
      height: 360,
      left: 140,
      top: 140,
    })
    if (grantWindow?.id !== undefined) {
      await sleep(150)
      let real = await chrome.windows.get(grantWindow.id)
      if (real.width !== 420 || real.height !== 360) {
        real = await chrome.windows
          .update(grantWindow.id, { width: 420, height: 360, left: 140, top: 140 })
          .catch((error: unknown) => {
            void logEvent('grant-window-resize-failed', { message: error instanceof Error ? error.message : String(error) })
            return real
          })
        await sleep(100)
        real = await chrome.windows.get(grantWindow.id)
      }
      await logEvent('grant-window-size', { size: `${real.width}x${real.height}` })
    }
    bridgeStatus(msg.connectionId, 'waiting', {
      message: 'Allow access in the dialog — your bank opens right after.',
    })
    return
  }
  await logEvent('permission-granted', { origins: family.join(',') })

  let connection: Connection
  try {
    const connResponse = await api('/bank-connections')
    if (!connResponse.ok) throw new Error(`API ${connResponse.status}: ${await connResponse.text()}`)
    const connections = (await connResponse.json()) as Connection[]
    const found = connections.find((c) => c.id === msg.connectionId && c.status === 'active')
    if (!found) throw new Error('Bank connection not found')
    connection = found
  } catch (error) {
    bridgeStatus(msg.connectionId, 'failed', { errorMessage: error instanceof Error ? error.message : 'Failed to load connection' })
    return
  }

  const popup = await chrome.windows.create({ url: connection.loginUrl, width: 470, height: 780, type: 'popup' })
  session = {
    connectionId: connection.id,
    accountId: connection.accountId,
    loginUrl: connection.loginUrl,
    origins: [new URL(connection.loginUrl).origin],
    windowId: popup?.id ?? null,
    startedAt: Date.now(),
  }
  await persistSession()
  await startSessionWatch()
  // Inject immediately: the hook only patches blob-url clicks and the relay
  // only watches window messages — both are passive, credentials-invisible.
  await injectAcrossSession()
  bridgeStatus(
    session.connectionId,
    'waiting',
    { accountId: connection.accountId, message: 'Log in and download the CSV. Frugal AI captures the file automatically.' },
  )
}

function endSessionPopup() {
  if (session?.windowId != null) void chrome.windows.remove(session.windowId).catch(() => undefined)
}

async function cleanupSession() {
  endSessionPopup()
  session = null
  await persistSession()
  await stopSessionWatch()
}

/**
 * Chrome does not reliably wake an idle MV3 service worker for
 * chrome.downloads events (login flows easily outlast the 30s idle timeout,
 * and then the download event falls on a dead worker — observed in the
 * wild). The injected page relay pings the worker while a session is
 * active; this storage flag tells it when to ping without waking anything.
 */
const SESSION_WATCH_ALARM = 'finai.sessionWatch'

/**
 * Alarm-based download sweep. chrome.downloads events don't reliably wake
 * an idle MV3 worker (observed in the wild), and a completed bank export
 * must not depend on that — alarms DO wake the worker. The sweep polls the
 * downloads API for session candidates and disk-reads anything completed
 * but not yet captured, guaranteeing capture within one alarm period.
 */
async function startSessionWatch() {
  try {
    await chrome.alarms.create(SESSION_WATCH_ALARM, { periodInMinutes: 0.5, delayInMinutes: 0.25 })
    await logEvent('alarm-created', { periodMinutes: 0.5 })
  } catch (error) {
    await logEvent('alarm-create-failed', { message: error instanceof Error ? error.message : String(error).slice(0, 120) })
  }
}

async function stopSessionWatch() {
  try {
    await chrome.alarms.clear(SESSION_WATCH_ALARM)
  } catch {
    // non-MV3 contexts
  }
}

async function injectCapture(tabId: number) {
  // Reading blob-URL CSVs requires the page's own JS context.
  // allFrames: banks like EQ Bank render the account UI — and its download
  // button — inside iframes. The per-frame flag inside each injected function
  // makes repeats idempotent.
  const hookResult = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, world: 'MAIN' as const, func: csvHookMain }).catch((error: unknown) => ({ injectionError: error instanceof Error ? error.message : String(error) }))
  const relayResult = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: captureRelay }).catch((error: unknown) => ({ injectionError: error instanceof Error ? error.message : String(error) }))
  const problems = ([hookResult, relayResult] as Array<Record<string, unknown> | undefined>)
    .flatMap((result, index) => (result && 'injectionError' in result ? [`script ${index === 0 ? 'hook' : 'relay'}: ${String(result['injectionError'])}`] : []))
  if (problems.length > 0) await logEvent('injection-failed', { tabId, problems })
}

/** Inject into every tab currently on any of the session's granted origins. */
async function injectAcrossSession() {
  const current = await hydrateSession()
  if (!current) return
  for (const origin of current.origins) {
    try {
      const tabs = await chrome.tabs.query({ url: [`${origin}/*`] })
      await logEvent('inject-scan', { origin, tabs: tabs.length })
      for (const tab of tabs) {
        if (tab.id !== undefined) await injectCapture(tab.id)
      }
    } catch (error) {
      await logEvent('inject-scan-failed', { origin, message: error instanceof Error ? error.message : String(error).slice(0, 200) })
    }
  }
}

/**
 * Follow the bank's redirects on any session-tab navigation. Origins granted
 * at connect (the domain family) get the capture relay; a redirect to a
 * genuinely different domain (AMEX: amex.ca → americanexpress.com) is the
 * ONE case where a mid-flow grant appears — as a sibling tab inside the bank
 * popup window, only for the popup the sync opened. Random browsing is never
 * interrupted.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    try {
      const current = await hydrateSession()
      if (!current || current.captured) return
      if (changeInfo.status !== 'complete' && !changeInfo.url) return
      const url = changeInfo.url ?? tab.url ?? ''
      if (!url.startsWith('http')) return
      let origin: string
      try {
        origin = new URL(url).origin
      } catch {
        return
      }
      if (await originGranted(origin)) {
        await injectCapture(tabId)
        return
      }
      if (tab.windowId !== current.windowId) return // not the sync popup
      await requestMidFlowGrant(current, origin, tab.index + 1)
    } catch (error) {
      await logEvent('navigate-listener-error', { message: error instanceof Error ? error.message : String(error).slice(0, 240) })
    }
  })()
})

/**
 * Open the grant page for a domain the bank redirected to mid-sync. A
 * session waiting on an outstanding grant stays quiet (grantsRequested
 * dedupes); once granted, grant-done adopts the origin, re-injects, closes
 * the grant tab and refocuses the bank tab.
 */
async function requestMidFlowGrant(sessionState: Session, origin: string, index?: number) {
  const family = domainFamilyPatterns(origin)
  if (family.length === 0) return
  if (sessionState.grantsRequested?.some((requested) => family.includes(requested))) return // grant page already open; waiting
  sessionState.grantsRequested = [...(sessionState.grantsRequested ?? []), ...family]
  await persistSession()
  await logEvent('grant-requested', { origin, origins: family.join(',') })
  const grantTab = await chrome.tabs.create({
    url: `${chrome.runtime.getURL('grant.html')}?origins=${encodeURIComponent(family.join(','))}&connectionId=${encodeURIComponent(sessionState.connectionId)}`,
    // Inside the bank popup window, right next to the bank tab — the user
    // never leaves the window they're already signing in from. The tab
    // ACTIVATES itself: an unnoticed background grant is what made the
    // mid-flow prompt appear only after the user's download.
    ...(sessionState.windowId != null && index !== undefined ? { windowId: sessionState.windowId, index } : {}),
  })
  if (grantTab?.id !== undefined) {
    void chrome.tabs.update(grantTab.id, { active: true }).catch(() => undefined)
    if (sessionState.windowId != null) {
      void chrome.windows.update(sessionState.windowId, { focused: true }).catch(() => undefined)
    }
  }
  bridgeStatus(sessionState.connectionId, 'waiting', {
    accountId: sessionState.accountId,
    message: `Your bank moved to ${origin} — allow access in the dialog to keep capturing.`,
  })
}

chrome.windows.onRemoved.addListener((windowId) => {
  void (async () => {
    const current = await hydrateSession()
    if (current?.windowId === windowId && !current.captured) {
      // Only the popup the sync opened matters — downloads in other windows are
      // still captured while the session lives.
      bridgeStatus(current.connectionId, 'cancel', { errorMessage: 'Bank popup was closed before the CSV was downloaded', accountId: current.accountId })
      await cleanupSession()
    }
  })()
})

// Idle-session reaper. Runs while the worker is alive; a worker restart also
// re-arms it, so a long sign-on is only reaped if it truly stalls (15 min).
// Skip in non-MV3 contexts (WXT's manifest scanner evaluates this module in
// Node, where a stray interval would hang the build).
if (typeof window === 'undefined') {
  setInterval(() => {
    void (async () => {
      const current = await hydrateSession()
      if (current && Date.now() - current.startedAt > SESSION_IDLE_TIMEOUT_MS) {
        bridgeStatus(current.connectionId, 'failed', { errorMessage: 'Sync timed out', accountId: current.accountId })
        await cleanupSession()
      }
    })()
  }, 60 * 1000)
}

// ---------------------------------------------------------------------------
// CSV capture → upload → handoff. The page hook relay and the
// downloads.onCreated fetch both call handleCapturedCsv; the session's
// captured flag makes the first capture win.
// ---------------------------------------------------------------------------

async function handleCapturedCsv(csvBase64: string, filename: string) {
  const current = await hydrateSession()
  if (!current) return // no active session — nothing to attach the capture to
  if (current.captured) return
  current.captured = true
  await persistSession()

  try {
    bridgeStatus(current.connectionId, 'capturing', { accountId: current.accountId, message: 'CSV captured — uploading to Frugal AI…' })
    const uploadedFileId = await uploadCaptured(current.connectionId, csvBase64, filename)
    await logEvent('upload-ok', { uploadedFileId, filename: filename.slice(0, 120) })
    bridgeStatus(current.connectionId, 'complete', {
      accountId: current.accountId,
      message: 'Done — your CSV is ready to review.',
      uploadedFileId,
      fileName: filename,
    })
  } catch (error) {
    bridgeStatus(current.connectionId, 'failed', {
      errorMessage: error instanceof Error ? error.message : 'Upload failed',
      accountId: current.accountId,
    })
    await logEvent('upload-failed', { message: error instanceof Error ? error.message : String(error).slice(0, 200) })
  }
  await cleanupSession()
}

async function uploadCaptured(connectionId: string, csvBase64: string, filename: string): Promise<string> {
  const bytes = Uint8Array.from(atob(csvBase64), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('file', new File([bytes], filename || 'transactions.csv', { type: 'text/csv' }))
  const uploadResponse = await api('/import-runs/upload', { method: 'POST', body: form })
  if (!uploadResponse.ok) throw new Error(`Upload failed: API ${uploadResponse.status} ${await uploadResponse.text()}`)
  const uploaded = (await uploadResponse.json()) as { id: string }
  await api(`/bank-connections/${connectionId}/synced`, { method: 'POST' })
  return uploaded.id
}

/**
 * downloads.onCreated: while a sync session is active, *any* download is a
 * candidate — bank export URLs (e.g. `DownloadSignedFile.ashx`) and blob
 * downloads carry no `.csv` hint in url or filename, and blob-URL downloads
 * usually arrive through the MAIN-world hook relay first. Whichever channel
 * lands first finishes the capture; the content-shape check happens in
 * fetchCsvViaTab, not by filename.
 */
try {
  chrome.downloads.onCreated.addListener((item) => {
    void (async () => {
      const current = await hydrateSession()
      if (!current || current.captured) {
        await logEvent('download-ignored', { reason: !current ? 'no session' : 'already captured', url: item.url.slice(0, 160) })
        return
      }
      // Which download origin: normally the URL's own origin. Some banks
      // (EQ Bank) POST into a hidden blank frame, and Chrome reports the
      // download's url as about:blank — origin literally "null" with an
      // empty filename. For those, fall back to the initiating page's
      // referrer, and treat unresolvable origins as session candidates:
      // the disk-read channel validates content at completion anyway.
      let downloadOrigin = ''
      try {
        downloadOrigin = new URL(item.url).origin
      } catch {
        downloadOrigin = item.url.slice(0, 60)
      }
      let referrerOrigin = ''
      try {
        referrerOrigin = new URL(item.referrer ?? '').origin
      } catch {
        referrerOrigin = ''
      }
      const unresolvable = !downloadOrigin.startsWith('http')
      const granted = (await originGranted(downloadOrigin)) || (unresolvable && referrerOrigin.startsWith('http') && (await originGranted(referrerOrigin)))
      if (!granted && !unresolvable) {
        // A granted-family download would have matched; this one is from a
        // different domain (e.g. AMEX redirects amex.ca →
        // global.americanexpress.com) — the mid-flow grant covers it.
        await logEvent('download-skipped-origin', {
          sessionOrigins: current.origins.join(','),
          downloadOrigin,
          referrerOrigin: referrerOrigin || '(none)',
          suggestedFilename: item.filename ?? '',
        })
        await requestMidFlowGrant(current, downloadOrigin)
        return
      }
      const filename = item.filename || 'transactions.csv'
      const candidate = { id: item.id, filename, url: item.url.slice(0, 200) }
      current.downloads = [...(current.downloads ?? []).filter((d) => d.id !== item.id), candidate]
      await persistSession()
      await logEvent('download-observed', { url: item.url.slice(0, 160), filename, referrer: (item.referrer ?? '').slice(0, 120) })
      // Capture channels: the in-page hook (blob URLs + download-anchor
      // clicks, instant) and the disk read once Chrome finishes writing
      // (below) — which covers every other delivery shape.
    })()
  })
} catch {
  // WXT's manifest scanner runs this module in a fake browser where the
  // downloads API throws — harmless, the real browser registers it.
}

/** A tracked download only counts if Chrome started it during THIS session — late 'complete' events from the previous session must never capture into the new one (observed: a stale data-URL completion closed the freshly opened popup of the next sync). */
function isSessionDownload(sessionState: Session, item: { id?: number; startTime?: string }): boolean {
  if (item.id === undefined) return false
  if (!sessionState.downloads?.some((d) => d.id === item.id)) return false
  if (!item.startTime) return true
  const startedAt = new Date(sessionState.startedAt).getTime()
  const downloadStarted = new Date(item.startTime).getTime()
  return !Number.isNaN(downloadStarted) && downloadStarted >= startedAt - 1000
}

/**
 * Disk-read fallback: once Chrome finishes writing a tracked download, give
 * the in-page channels a short grace period, then read the file straight
 * from disk via file:// access (needs the user's one-time "Allow access to
 * file URLs" toggle). This is what makes banks whose export endpoints are
 * one-time POST tokens (EQ Bank, and others) capturable at all — the bytes
 * Chrome already saved are the source of truth.
 */
try {
  chrome.downloads.onChanged.addListener((delta) => {
    void (async () => {
      if (delta.state?.current !== 'complete') {
        if (delta.state?.current === 'interrupted') {
          const sessionAfterInterrupt = await hydrateSession()
          if (sessionAfterInterrupt?.downloads) {
            sessionAfterInterrupt.downloads = sessionAfterInterrupt.downloads.filter((d) => d.id !== delta.id)
            await persistSession()
          }
        }
        return
      }
      const current = await hydrateSession()
      if (!current || current.captured) return
      const tracked = current.downloads?.some((d) => d.id === delta.id)
      if (!tracked) return
      const items = await chrome.downloads.search({ id: delta.id })
      if (!isSessionDownload(current, items[0] ?? {})) return
      await sleep(2000) // grace: page-hook channels may still land first
      const afterGrace = await hydrateSession()
      if (!afterGrace || afterGrace.captured) return
      const refreshed = await chrome.downloads.search({ id: delta.id })
      if (!isSessionDownload(afterGrace, refreshed[0] ?? {})) return
      // item.filename at onCreated may be merely a suggested name; by
      // completion the downloads API knows the absolute path on disk.
      const absolutePath = refreshed[0]?.filename || ''
      await readDownloadFromDisk(afterGrace, delta.id, absolutePath)
    })()
  })
} catch {
  // non-MV3 contexts (WXT manifest scanner)
}

/**
 * A real bank CSV: several all-comma lines, not a JSON error page (banks and
 * storage endpoints love to answer failed auth with one-line JSON — seen in
 * the wild), not an HTML page.
 */
export function looksLikeCsv(sampleText: string): boolean {
  const sample = sampleText.slice(0, 4096)
  const first = sample[0]
  if (first === '{' || first === '[' || first === '<') return false
  const lines = sample.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) return false
  const commaLines = lines.filter((line) => line.split(',').length >= 2).length
  return commaLines >= 2
}

async function readDownloadFromDisk(sessionState: Session, downloadId: number, filename: string) {
  try {
    const fileUrl = `file://${filename.split('/').map(encodeURIComponent).join('/')}`
    const response = await fetch(fileUrl, { credentials: 'omit' })
    const text = await response.text()
    if (!looksLikeCsv(text)) {
      await logEvent('disk-read-rejected', { filename: filename.slice(0, 100), bytes: text.length })
      return
    }
    const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    await logEvent('disk-read-ok', { filename: filename.slice(0, 100), bytes: text.length })
    await handleCapturedCsv(base64, filename)
  } catch (error) {
    await logEvent('disk-read-failed', { filename: filename.slice(0, 100), message: error instanceof Error ? error.message : String(error).slice(0, 160) })
    const later = await hydrateSession()
    if (later && !later.captured && !later.fileAccessHintShown) {
      later.fileAccessHintShown = true
      await persistSession()
      bridgeStatus(later.connectionId, 'waiting', {
        accountId: later.accountId,
        message:
          `Couldn't auto-read “${filename.split('/').pop()}” (~/Downloads). Either import that file from the Import page, or enable one-time file access: chrome://extensions → FinAI Bank Sync → Details → “Allow access to file URLs”.`,
      })
    }
  }
}

/** Sweep: capture any completed-but-uncaptured session download (used by the alarm and the keep-alive ping). */
async function sweepSessionDownloads(): Promise<void> {
  try {
    const current = await hydrateSession()
    if (!current || current.captured || !current.downloads || current.downloads.length === 0) return
    const items = await chrome.downloads.search({ orderBy: ['-startTime'], limit: 20 })
    for (const item of items) {
      if (current.captured) return
      if (!isSessionDownload(current, item)) continue
      if (item.state !== 'complete') continue
      const resolved = item.filename || ''
      await logEvent('sweep-candidate', { id: item.id, filename: resolved.split('/').pop()?.slice(0, 80) })
      await readDownloadFromDisk(current, item.id, resolved)
      return // one capture attempt per sweep
    }
  } catch (error) {
    await logEvent('sweep-failed', { message: error instanceof Error ? error.message : String(error).slice(0, 160) })
  }
}

chrome.alarms?.onAlarm?.addListener((alarm) => {
  if (alarm.name !== SESSION_WATCH_ALARM) return
  void sweepSessionDownloads()
})

// ---------------------------------------------------------------------------
// message handling
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: WorkerMessage, _sender, sendResponse) => {
  void (async () => {
    switch (message?.type) {
      case 'pair': {
        try {
          const payload = PairingPayloadSchema.parse((message as unknown as { payload: unknown }).payload)
          await chrome.storage.local.set({
            [AUTH_KEY]: {
              apiBaseUrl: payload.apiBaseUrl,
              supabaseUrl: payload.supabaseUrl,
              supabaseAnonKey: payload.supabaseAnonKey,
              accessToken: payload.accessToken,
              refreshToken: payload.refreshToken,
            },
          })
          const check = await api('/bank-connections')
          if (!check.ok) throw new Error(`Could not reach Frugal AI (${check.status})`)
          await logEvent('paired', { apiBaseUrl: payload.apiBaseUrl })
          void bridgeRelay(BridgeMessageSchema.parse({ kind: 'finai:pairing-accepted' }))
          void fileAccessRelay()
          sendResponse({ ok: true })
        } catch (error) {
          sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Pairing failed' })
        }
        break
      }
      case 'start-sync': {
        await startSync(message)
        sendResponse({ ok: true })
        break
      }
      case 'cancel-sync': {
        const cancel = await hydrateSession()
        if (cancel && cancel.connectionId === message.connectionId) {
          bridgeStatus(cancel.connectionId, 'cancel', { accountId: cancel.accountId, errorMessage: 'Sync cancelled' })
          await cleanupSession()
        }
        sendResponse({ ok: true })
        break
      }
      case 'capture-csv': {
        await logEvent('relay-capture', { filename: message.filename.slice(0, 120) })
        await handleCapturedCsv(message.csvBase64, message.filename)
        sendResponse({ ok: true })
        break
      }
      case 'get-session': {
        sendResponse({
          paired: (await getAuth()) !== null,
          busy: (await hydrateSession()) !== null,
          fileAccess: await new Promise<boolean>((resolve) => chrome.extension.isAllowedFileSchemeAccess((allowed) => resolve(Boolean(allowed)))),
        })
        break
      }
      case 'grant-done': {
        // The grant page confirmed new origin patterns. If a session is
        // waiting on a redirect grant, adopt the origins and resume capture;
        // otherwise it was the pre-connect grant — the user presses Sync again.
        try {
        const granted = await chrome.permissions.getAll()
        const grantedSet = new Set<string>(granted.origins ?? [])
        await logEvent('grant-done', { granted: message.grantedOrigins.join(',') })
        const current = await hydrateSession()
        if (current) {
          for (const pattern of message.grantedOrigins) {
            if (!grantedSet.has(pattern)) continue
            const origin = pattern.replace(/\/\*$/, '')
            // Wildcard patterns stay in the permissions (admission checks use
            // chrome.permissions.contains); only real origins join the list.
            if (origin.includes('*.')) continue
            if (!current.origins.includes(origin) && origin.startsWith('http')) {
              current.origins.push(origin)
              await logEvent('session-origin-added', { origin })
            }
          }
          await persistSession()
          await injectAcrossSession()
          // Put the user back on their bank tab: close the grant tab inside the
          // popup window and re-activate the bank tab.
          if (current.windowId != null) {
            const popupTabs = await chrome.tabs.query({ windowId: current.windowId })
            for (const grantTab of popupTabs.filter((t) => t.url?.includes('grant.html'))) {
              if (grantTab.id !== undefined) void chrome.tabs.remove(grantTab.id).catch(() => undefined)
            }
            const bankTab = popupTabs.find((t) => t.id !== undefined && !t.url?.includes('grant.html'))
            if (bankTab?.id !== undefined) {
              void chrome.tabs.update(bankTab.id, { active: true }).catch(() => undefined)
              void chrome.windows.update(current.windowId, { focused: true }).catch(() => undefined)
            }
          }
          bridgeStatus(current.connectionId, 'waiting', {
            accountId: current.accountId,
            message: 'Access granted — continue in your bank and download the CSV.',
          })
        } else {
          // Pre-connect grant: finish the sync the user asked for.
          const stored = await chrome.storage.session.get(PENDING_START_KEY)
          const pending = stored[PENDING_START_KEY] as { connectionId?: string; originPattern?: string } | undefined
          if (pending?.connectionId && pending.originPattern) {
            await chrome.storage.session.remove(PENDING_START_KEY)
            const family = domainFamilyPatterns(pending.originPattern.replace(/\/\*$/, ''))
            if (family.length > 0 && family.every((pattern) => grantedSet.has(pattern))) {
              await startSync({ connectionId: pending.connectionId, originPattern: pending.originPattern })
            }
          } else {
            void bridgeRelay(BridgeMessageSchema.parse({ kind: 'finai:bridge-ready' }))
          }
        }
        } catch (error) {
          await logEvent('grant-done-failed', { message: error instanceof Error ? error.message : String(error).slice(0, 240) })
        }
        sendResponse({ ok: true })
        break
      }
      default:
        sendResponse({ ok: false })
    }
  })()
  return true // async sendResponse
})

/** Tell the app whether disk-read capture is enabled (the Chrome file-URL toggle). */
function fileAccessRelay() {
  void (async () => {
    const allowed = await new Promise<boolean>((resolve) => chrome.extension.isAllowedFileSchemeAccess((ok) => resolve(Boolean(ok))))
    await logEvent('file-access-state', { allowed })
    void bridgeRelay(BridgeMessageSchema.parse({ kind: 'finai:file-access', allowed }))
  })()
}

/** One-way notice to the app (pairing); statuses use bridgeStatus. */
function bridgeRelay(message: unknown) {
  void (async () => {
    const tabs = await chrome.tabs.query({ url: APP_TAB_MATCHES })
    for (const tab of tabs) {
      if (tab.id === undefined) continue
      try {
        await chrome.tabs.sendMessage(tab.id, message)
      } catch {
        // no bridge available
      }
    }
  })()
}

// ---------------------------------------------------------------------------
// Injected: MAIN-world hook. Runs in the page's own JS context where blob-URL
// CSV downloads are created. Patches URL.createObjectURL and the anchor click
// so page-created CSVs (the typical SPA export) are read there — no fetch
// permission needed. Self-contained (executeScript serializes the function source).
// Never touches the login form: it only observes downloads.
// ---------------------------------------------------------------------------

function csvHookMain() {
  const flagKey = '__finaiCsvHook'
  const w = window as unknown as Record<string, unknown>
  // Runs in every frame of granted-origin pages — banks render their download
  // UI inside iframes, and the blob is created in whichever frame runs it.
  w.__finaiHookVersion = 3 // v3: click-capture for download anchors
  if (w[flagKey]) return
  w[flagKey] = true

  const registry = new Map<string, Blob>()
  try {
    const originalCreate = URL.createObjectURL.bind(URL)
    URL.createObjectURL = function createObjectURL(blob: Blob) {
      const url = originalCreate(blob)
      if (blob.size < 50 * 1024 * 1024) registry.set(url, blob)
      return url
    }
  } catch {
    // the page hardened its export — the anchor patch still covers clicks
  }

  function readBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result).split(',')?.[1] ?? '')
      reader.onerror = () => reject(new Error('cannot read CSV'))
      reader.readAsDataURL(blob)
    })
  }

  async function report(blob: Blob, filename: string) {
    try {
      const csvBase64 = await readBase64(blob)
      window.postMessage({ __finaiCsvCapture: true, csvBase64, filename: filename || 'transactions.csv' }, window.location.origin)
    } catch {
      // not readable — leave capture to other channels
    }
  }

  try {
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement, ...args: unknown[]) {
      try {
        const href = this.getAttribute('href') ?? ''
        if (href.startsWith('blob:')) {
          const blob = registry.get(href)
          const filename = this.getAttribute('download') ?? 'transactions.csv'
          if (blob) void report(blob, filename)
          else {
            void (async () => {
              try {
                const blobFromUrl = await (await fetch(href)).blob()
                await report(blobFromUrl, filename)
              } catch {
                // fall back to the downloads.onCreated channel
              }
            })()
          }
        }
      } catch {
        // never break the page's own download
      }
      return (originalClick as (...a: unknown[]) => void).apply(this, args)
    }
  } catch {
    // prototype already patched by a prior injection; message channel remains
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = (event.data ?? {}) as { __finaiFetchCsv?: boolean; url?: string; filename?: string }
    if (!data.__finaiFetchCsv || !data.url) return
    void (async () => {
      try {
        const blob = registry.get(data.url!) ?? (await (await fetch(data.url!)).blob())
        await report(blob, data.filename ?? 'transactions.csv')
      } catch (error) {
        window.postMessage({ __finaiCsvCaptureError: String(error) }, window.location.origin)
      }
    })()
  })

  // Download-intent anchor clicks: fetch the file IN THE PAGE (its cookies,
  // before any navigation unloads this context and with it the capture
  // relay) instead of letting the browser stream it to disk. If the fetch
  // fails or the body isn't a CSV, fall back to the native navigation so
  // the user always gets their file.
  document.addEventListener(
    'click',
    (event) => {
      try {
        const target = event.target as Element | null
        const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
        if (!anchor) return
        const href = anchor.getAttribute('href') ?? ''
        if (!href) return
        const absolute = new URL(href, window.location.href).toString()
        if (!/^https?:/.test(absolute)) return
        const isDownload = anchor.hasAttribute('download') || /\.csv(\?|$)/i.test(absolute) || /download|export/i.test(absolute)
        if (!isDownload) return
        window.postMessage({ __finaiHookLog: 'click-captured', href: absolute.slice(0, 120) }, window.location.origin)
        event.preventDefault()
        event.stopPropagation()
        void (async () => {
          try {
            const blob = await (await fetch(absolute, { credentials: 'include' })).blob()
            const sample = await blob.slice(0, 4096).text()
            const first = sample[0]
            const commaLines = sample.split('\n').filter((line) => line.includes(',')).length
            const csvOk = blob.type.includes('csv') || (!(first === '{' || first === '[' || first === '<') && commaLines >= 2)
            if (!csvOk) throw new Error('not a CSV')
            const anchorName = anchor.getAttribute('download')
            const fallbackName = absolute.split('/').pop() || 'transactions.csv'
            const filename = anchorName && anchorName.length > 0 ? anchorName : decodeURIComponent(fallbackName).split('?').shift() || 'transactions.csv'
            window.postMessage({ __finaiHookLog: 'click-fetch-ok', filename: filename.slice(0, 80) }, window.location.origin)
            await report(blob, filename)
          } catch (error) {
            window.postMessage({ __finaiHookLog: 'click-fetch-failed', message: String(error).slice(0, 80) }, window.location.origin)
            // in-page fetch failed (CSP/one-time token consumed elsewhere) —
            // degrade gracefully: let the browser download the file normally
            window.location.href = absolute
          }
        })()
      } catch {
        // never break the page's own download
      }
    },
    true,
  )
}

// ---------------------------------------------------------------------------
// Injected: capture relay (ISOLATED world). Passively relays the hook's CSV
// captures to the service worker. No UI, no gesture interaction, no credential visibility.
// ---------------------------------------------------------------------------

function captureRelay() {
  const flagKey = '__finaiCaptureRelay'
  const w = window as unknown as Record<string, boolean>
  if (w[flagKey]) return
  w[flagKey] = true

  // Page-world logging: works even when the service worker is dead, so the
  // diagnostics page can show relay-side failures (hook telemetry, upload
  // relays) directly.
  const relayLog = (kind: string, detail: Record<string, unknown> = {}) => {
    void (async () => {
      try {
        const stored = await chrome.storage.local.get('finai.log')
        const events = (stored['finai.log'] as Array<{ at: string; kind: string; detail?: Record<string, unknown> }>) ?? []
        events.push({ at: new Date().toISOString(), kind: `relay:${kind}`, detail })
        await chrome.storage.local.set({ 'finai.log': events.slice(-80) })
      } catch {
        // nothing to do
      }
    })()
  }

  function normalizeFilename(filename: string | undefined): string {
    try {
      return decodeURIComponent(filename ?? 'transactions.csv').split('?')[0] || 'transactions.csv'
    } catch {
      return 'transactions.csv'
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return
    const data = (event.data ?? {}) as { __finaiCsvCapture?: boolean; csvBase64?: string; filename?: string; __finaiHookLog?: string; message?: string }
    if (data.__finaiHookLog) {
      relayLog(`hook:${data.__finaiHookLog}`, { detail: (data.message ?? data.filename ?? '').slice(0, 80) })
      return
    }
    if (!data.__finaiCsvCapture || typeof data.csvBase64 !== 'string') return
    relayLog('capture-relayed', { filename: normalizeFilename(data.filename).slice(0, 60) })
    void chrome.runtime.sendMessage({ type: 'capture-csv', csvBase64: data.csvBase64, filename: normalizeFilename(data.filename) })
  })
}

// WXT entrypoint contract: the background module's body runs eagerly on
// import (listeners above), so this default export is simply the hook WXT
// needs to generate the service-worker manifest entry.
export default defineBackground(() => {})
