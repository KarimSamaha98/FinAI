import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/accountTypes'
import { CURRENCY_CODES } from '../../lib/currencies'

export function AccountSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accounts, updateAccount, deleteAccount } = useAccounts()
  const { profiles, deleteProfile } = useImportProfiles(id)
  const account = accounts.find((a) => a.id === id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!account) return <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</p>

  const profile = profiles[0] ?? null

  async function handleField<K extends 'name' | 'type' | 'institution' | 'currencyCode' | 'startingBalance' | 'balanceAsOf'>(
    field: K,
    value: string,
  ) {
    if (!account) return
    setSaving(true)
    setError(null)
    try {
      const parsed = field === 'startingBalance' ? Number(value) : value
      await updateAccount(account.id, { [field]: parsed } as never)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!account) return
    setSaving(true)
    setError(null)
    try {
      await updateAccount(account.id, { isArchived: true })
      navigate('/accounts')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive account')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!account) return
    setError(null)
    try {
      await deleteAccount(account.id)
      navigate('/accounts')
    } catch {
      // Blocked by existing data — offer archive instead.
      if (confirm('This account has existing transactions or an import profile. Archive it instead?')) {
        try {
          await updateAccount(account.id, { isArchived: true })
          navigate('/accounts')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to archive account')
        }
      }
    }
  }

  return (
    <main style={{ padding: '1.5rem', maxWidth: 480, margin: '0 auto' }}>
      <h1>{account.name}</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: '-0.5rem' }}>Account settings</p>
      {error && <Alert variant="error">{error}</Alert>}

      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <label>
          Name
          <input type="text" defaultValue={account.name} disabled={saving} onBlur={(e) => handleField('name', e.target.value)} />
        </label>
        <label>
          Type
          <select defaultValue={account.type} disabled={saving} onChange={(e) => handleField('type', e.target.value)}>
            {ACCOUNT_TYPE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Institution
          <input
            type="text"
            defaultValue={account.institution ?? ''}
            disabled={saving}
            onBlur={(e) => handleField('institution', e.target.value)}
          />
        </label>
        <label>
          Currency
          <select defaultValue={account.currencyCode} disabled={saving} onChange={(e) => handleField('currencyCode', e.target.value)}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <label style={{ flex: 1 }}>
            Starting balance
            <input
              type="number"
              step="0.01"
              defaultValue={account.startingBalance}
              disabled={saving}
              onBlur={(e) => handleField('startingBalance', e.target.value)}
            />
          </label>
          <label style={{ flex: 1 }}>
            as of
            <input
              type="date"
              defaultValue={account.balanceAsOf}
              disabled={saving}
              onChange={(e) => handleField('balanceAsOf', e.target.value)}
            />
          </label>
        </div>
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Import profile</h2>
        {profile ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{profile.name}</span>
            <Button variant="danger" onClick={() => deleteProfile(profile.id)}>
              Delete profile
            </Button>
          </div>
        ) : (
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            No import profile yet. <Link to={`/accounts/${account.id}/import`}>Set one up</Link>
          </p>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-5)' }}>
        <Button variant="secondary" onClick={handleArchive}>
          Archive account
        </Button>
        <Button variant="danger" onClick={handleDelete}>
          Delete account
        </Button>
      </div>
    </main>
  )
}
