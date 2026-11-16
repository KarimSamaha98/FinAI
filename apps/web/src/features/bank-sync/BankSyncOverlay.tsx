import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { useBankSync } from '../../hooks/useBankSync'

/**
 * Global Bank Sync status widget: a floating notice while a bank sync runs —
 * "log in and download the CSV" while the user works in the bank popup, then
 * "capturing…" and, once the capture lands, a hand-off button straight into
 * the import review. Mounted once in the AppLayout so it's reachable from
 * any page; there is no recipe/recording UI by design.
 */
export function BankSyncOverlay() {
  const navigate = useNavigate()
  // Only this instance dispatches the capture-complete navigation event and
  // owns the terminal-state widget; the Settings section shows its row state.
  const { activeSync, cancelSync, startSyncById } = useBankSync(true)

  // When the capture completes while the user is anywhere in the app, take
  // them straight to the import review for the captured file.
  useEffect(() => {
    const handler = (event: Event) => {
      const { uploadedFileId, fileName, accountId } = (event as CustomEvent<{ uploadedFileId: string; fileName: string; accountId: string }>).detail
      navigate('/import', { state: { uploadedFileId, fileName, accountId, autoParse: true } })
    }
    window.addEventListener('finai-bank-sync-captured', handler)
    return () => window.removeEventListener('finai-bank-sync-captured', handler)
  }, [navigate])

  if (!activeSync || ['complete', 'cancel'].includes(activeSync.status)) return null

  const statusText =
    activeSync.status === 'waiting'
      ? activeSync.stepLabel || 'Log in to your bank and download the CSV — Frugal AI captures the file automatically.'
      : activeSync.status === 'capturing'
        ? activeSync.stepLabel || 'CSV captured — uploading…'
        : activeSync.errorMessage || 'Something went wrong'

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        maxWidth: 320,
        background: 'var(--surface, #fff)',
        color: 'inherit',
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 12,
        padding: 'var(--space-3)',
        boxShadow: '0 4px 18px rgba(0,0,0,.14)',
        zIndex: 60,
      }}
    >
      <p style={{ margin: 0, fontWeight: 600 }}>Bank sync</p>
      <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.9rem' }}>{statusText}</p>
      {activeSync.errorMessage && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'var(--space-2) 0 0' }}>
          The bank popup stays open — you can still download the CSV manually and import it.
        </p>
      )}
      {(activeSync.status === 'waiting' || activeSync.status === 'capturing') && (
        <button
          type="button"
          onClick={() => cancelSync(activeSync.connectionId)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline', padding: 'var(--space-2) 0 0', fontSize: '0.85rem' }}
        >
          Cancel this sync
        </button>
      )}
      {['failed'].includes(activeSync.status) && (
        <Button variant="secondary" onClick={() => startSyncById(activeSync.connectionId)}>
          Try again
        </Button>
      )}
    </div>
  )
}
