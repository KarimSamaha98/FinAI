import { useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { FieldSelect } from '../../components/FieldSelect'
import { useAccounts } from '../../hooks/useAccounts'
import { useBankSync } from '../../hooks/useBankSync'

function pairStatusText(pairing: string, error: string | null): string {
  switch (pairing) {
    case 'paired':
      return 'Extension connected'
    case 'not-installed':
      return 'Extension not detected'
    case 'failed':
      return error ?? 'Pairing failed'
    default:
      return 'Checking for the extension…'
  }
}

/**
 * Bank sync management UI. With `accountId` set (account settings page) it
 * manages exactly that account's connection; without it (main settings) it
 * lists every connected bank.
 */
export function BankSyncSection({ accountId: accountIdProp }: { accountId?: string }) {
  const scoped = accountIdProp !== undefined
  const { accounts } = useAccounts()
  const {
    connections,
    loading,
    error,
    refresh,
    pairing,
    pairError,
    fileAccess,
    lastFailures,
    activeSync,
    createConnection,
    disconnectConnection,
    startSync,
  } = useBankSync()

  const [showForm, setShowForm] = useState(false)
  const [accountId, setAccountId] = useState('')
  const [loginUrl, setLoginUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const activeConnections = connections.filter(
    (c) => c.status === 'active' && (!scoped || c.accountId === accountIdProp),
  )

  async function handleConnect() {
    setFormError(null)
    const targetAccountId = accountIdProp ?? accountId
    if (!targetAccountId || !loginUrl.trim()) {
      setFormError('Paste your bank’s sign-on URL')
      return
    }
    let normalized = loginUrl.trim()
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`
    try {
      const url = new URL(normalized)
      if (!/^https?:$/.test(url.protocol) || url.origin === 'null') throw new Error('bad URL')
    } catch {
      setFormError('That doesn’t look like a working online-banking URL')
      return
    }
    setCreating(true)
    try {
      const connection = await createConnection({ accountId: targetAccountId, loginUrl: normalized })
      startSync(connection)
      setShowForm(false)
      setLoginUrl('')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to connect')
    } finally {
      setCreating(false)
    }
  }

  const accountOptions = accounts.map((account) => ({
    value: account.id,
    label: `${account.name}${account.institution ? ` (${account.institution})` : ''}`,
  }))

  return (
    <Card style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <h2 style={{ margin: 0 }}>Bank sync</h2>
        <span
          style={{
            fontSize: '0.8rem',
            padding: '2px 10px',
            borderRadius: 999,
            background: pairing === 'paired' ? '#dcfce7' : '#f1f5f9',
            color: pairing === 'paired' ? '#166534' : 'inherit',
          }}
        >
          {pairStatusText(pairing, pairError ?? null)}
        </span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 'var(--space-3)', marginTop: 0 }}>
        “Sync” opens your bank in a popup — you log in and download the export yourself, Frugal AI catches that file and opens it
        for review. Passwords and codes are never seen by Frugal AI.
      </p>
      {pairing === 'not-installed' && (
        <Alert variant="info">
          Install the FinAI Bank Sync extension, then reload this page. From the built extension folder
          <code style={{ margin: '0 4px' }}>apps/extension/dist/chrome-mv3</code>
          use Chrome → Extensions → “Load unpacked”.
        </Alert>
      )}
      {pairing === 'failed' && <Alert variant="error">{pairError ?? 'Pairing failed'}</Alert>}
      {pairing === 'paired' && fileAccess === false && (
        <Alert variant="info">
          <strong>One-time setup for automatic capture:</strong> some banks download files in a way FinAI can only read from your
          Downloads folder. Enable it once: Chrome → <code style={{ margin: '0 4px' }}>chrome://extensions</code> → FinAI Bank Sync →
          Details → turn on <strong>“Allow access to file URLs”</strong>, then reload this page. Without it, you can still import
          downloaded CSVs manually.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {activeConnections.length === 0 && !showForm && (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No banks connected yet.</p>
      )}

      {activeConnections.map((connection) => {
        const account = accounts.find((a) => a.id === connection.accountId)
        const sync = activeSync?.connectionId === connection.id ? activeSync : null
        return (
          <div
            key={connection.id}
            style={{ borderTop: '1px solid var(--border, #e5e7eb)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-3)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'baseline' }}>
              <strong>{connection.bankSlug}</strong>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '2px 0 var(--space-3)' }}>
              {account ? `${account.name} · ` : ''}
              {connection.lastSyncedAt ? `last synced ${new Date(connection.lastSyncedAt).toLocaleString()}` : 'never synced'}
              {sync && !['complete', 'failed', 'cancel'].includes(sync.status) ? ` · ${sync.status}` : ''}
            </p>
            {!sync && lastFailures[connection.id] && (
              <Alert variant="error">
                Last sync failed: {lastFailures[connection.id]} — press Sync bank to retry.
              </Alert>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <Button variant="primary" disabled={!!sync && !['failed', 'cancel'].includes(sync.status)} onClick={() => startSync(connection)}>
                Sync bank
              </Button>
              <Button
                variant="secondary"
                disabled={!!sync && !['failed', 'cancel'].includes(sync.status)}
                onClick={async () => {
                  await disconnectConnection(connection.id)
                  void refresh()
                }}
              >
                Disconnect
              </Button>
            </div>
            {sync && !['complete', 'cancel'].includes(sync.status) && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 'var(--space-2) 0 0' }}>
                {sync.errorMessage ?? sync.stepLabel}
              </p>
            )}
          </div>
        )
      })}

      {!showForm && (
        <Button
          variant="secondary"
          disabled={pairing !== 'paired'}
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setShowForm(true)}
        >
          {pairing === 'paired' ? 'Connect a bank' : 'Connect a bank (extension required)'}
        </Button>
      )}

      {showForm && (
        <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <Alert variant="info">
            Paste your bank’s online-banking sign-on URL — for CIBC that’s
            <code style={{ margin: '0 4px' }}>www.cibconline.cibc.com</code>
            (not cibc.ca). Banks that redirect to other domains mid-login ask once for access to each. Chrome will ask for
            permission — that’s how your banking stays private to this device.
          </Alert>
          {formError && <Alert variant="error">{formError}</Alert>}
          {scoped ? (
            <input type="hidden" value={accountIdProp ?? ''} />
          ) : (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              Account
              <FieldSelect value={accountId} options={accountOptions} onChange={setAccountId} placeholder="Choose the account" />
            </label>
          )}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            Bank sign-on URL
            <input
              type="text"
              inputMode="url"
              placeholder="e.g. https://www.cibconline.cibc.com/…#auth/signon"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              disabled={loading}
            />
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleConnect()} disabled={creating}>
              {creating ? 'Connecting…' : 'Connect — opens the bank to sync'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
