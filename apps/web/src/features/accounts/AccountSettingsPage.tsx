import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/accountTypes'
import { CURRENCY_CODES } from '../../lib/currencies'
import { CardAppearanceEditor, MAX_CARD_PHOTO_BYTES } from './CardAppearanceEditor'
import { UpdateBalanceModal } from './UpdateBalanceModal'

export function AccountSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accounts, updateAccount, deleteAccount, uploadCardImage, removeCardImage } = useAccounts()
  const { profiles, deleteProfile } = useImportProfiles(id)
  const account = accounts.find((a) => a.id === id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Shown immediately; saved after a short pause so dragging the custom colour picker doesn't fire a request per step.
  const [showUpdateBalance, setShowUpdateBalance] = useState(false)
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  const colorSave = useRef<{ timer: ReturnType<typeof setTimeout>; save: () => void } | null>(null)
  // Leaving the page mid-pause saves right away rather than dropping the change.
  useEffect(() => () => {
    if (colorSave.current) {
      clearTimeout(colorSave.current.timer)
      colorSave.current.save()
    }
  }, [])

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

  function handleColorChange(color: string) {
    if (!account) return
    const accountId = account.id
    setPendingColor(color)
    if (colorSave.current) clearTimeout(colorSave.current.timer)
    const save = async () => {
      colorSave.current = null
      try {
        await updateAccount(accountId, { cardColor: color })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save card colour')
      } finally {
        setPendingColor(null)
      }
    }
    colorSave.current = { timer: setTimeout(save, 400), save }
  }

  async function handleCardPhoto(file: File) {
    if (!account) return
    setError(null)
    if (file.size > MAX_CARD_PHOTO_BYTES) {
      setError('Card photo must be 5 MB or smaller')
      return
    }
    setSaving(true)
    try {
      await uploadCardImage(account.id, file)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload card photo')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveCardPhoto() {
    if (!account) return
    setSaving(true)
    setError(null)
    try {
      await removeCardImage(account.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove card photo')
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
        <div key={account.balanceUpdatedAt} style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
        <div>
          <Button variant="secondary" onClick={() => setShowUpdateBalance(true)}>
            Update balance
          </Button>
        </div>
      </Card>

      {showUpdateBalance && (
        <UpdateBalanceModal
          open={showUpdateBalance}
          onClose={() => setShowUpdateBalance(false)}
          account={account}
          updateAccount={updateAccount}
        />
      )}

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Card</h2>
        <CardAppearanceEditor
          name={account.name}
          color={pendingColor ?? account.cardColor}
          photoUrl={account.cardImageUrl}
          busy={saving}
          onColorChange={handleColorChange}
          onPhotoSelected={handleCardPhoto}
          onRemovePhoto={handleRemoveCardPhoto}
        />
      </Card>

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Import profile</h2>
        {profile ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{profile.name}</span>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <Button variant="primary" onClick={() => navigate(`/accounts/${account.id}/import`)}>
                Import CSV
              </Button>
              <Button variant="danger" onClick={() => deleteProfile(profile.id)}>
                Delete profile
              </Button>
            </div>
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
