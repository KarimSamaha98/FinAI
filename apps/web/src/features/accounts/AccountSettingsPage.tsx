import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { PageHeader } from '../../components/BackButton'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/accountTypes'
import { FieldSelect } from '../../components/FieldSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { SegmentedControl } from '../../components/SegmentedControl'
import { useCurrencies } from '../../hooks/useCurrencies'
import { CardAppearanceEditor, MAX_CARD_PHOTO_BYTES } from './CardAppearanceEditor'
import { UpdateBalanceModal } from './UpdateBalanceModal'
import { CsvWizardHost } from '../import/CsvWizardHost'

/** One titled card on the settings page. */
function SettingsSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Card className="settings-section">
      <header className="settings-section-header">
        <h2>{title}</h2>
        {hint && <p className="settings-section-hint">{hint}</p>}
      </header>
      {children}
    </Card>
  )
}

/** A label on the left, its control or actions on the right (stacking when narrow). */
function SettingsRow({ label, detail, children }: { label: ReactNode; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <span className="settings-row-label">{label}</span>
        {detail && <span className="settings-row-detail">{detail}</span>}
      </div>
      <div className="settings-row-actions">{children}</div>
    </div>
  )
}

/**
 * An account's settings: a page (not a wizard) since it's a set of independent
 * edits that save as you go. Destructive actions confirm in the app's own
 * modals; setup flows (CSV profile, balance update) open over it.
 */
export function AccountSettingsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { accounts, updateAccount, deleteAccount, uploadCardImage, removeCardImage } = useAccounts()
  const { profiles, deleteProfile, refresh: refreshProfiles } = useImportProfiles(id)
  const { options: currencyOptions } = useCurrencies()
  const account = accounts.find((a) => a.id === id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUpdateBalance, setShowUpdateBalance] = useState(false)
  // Shown immediately; saved after a short pause so dragging the custom colour picker doesn't fire a request per step.
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  // Open "Set up / Redo CSV profile" wizard; existingProfileId set when redoing.
  const [csvWizard, setCsvWizard] = useState<{ existingProfileId: string | null } | null>(null)
  const [confirming, setConfirming] = useState<null | 'remove-account' | 'delete-profile'>(null)
  const colorSave = useRef<{ timer: ReturnType<typeof setTimeout>; save: () => void } | null>(null)
  // Leaving the page mid-pause saves right away rather than dropping the change.
  useEffect(
    () => () => {
      if (colorSave.current) {
        clearTimeout(colorSave.current.timer)
        colorSave.current.save()
      }
    },
    [],
  )

  if (!account) return <p className="settings-loading">Loading…</p>

  const profile = profiles[0] ?? null
  const backToAccount = `/accounts?selected=${account.id}`

  /** Runs a save, showing any failure in the page's alert. */
  async function save(action: () => Promise<unknown>, failure: string) {
    setSaving(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err instanceof Error ? err.message : failure)
    } finally {
      setSaving(false)
    }
  }

  function handleField(field: 'name' | 'type' | 'institution' | 'currencyCode' | 'startingBalance' | 'balanceAsOf', value: string) {
    if (!account) return
    const parsed = field === 'startingBalance' ? Number(value) : value
    void save(() => updateAccount(account.id, { [field]: parsed } as never), 'Failed to save')
  }

  function handleColorChange(color: string) {
    if (!account) return
    const accountId = account.id
    setPendingColor(color)
    if (colorSave.current) clearTimeout(colorSave.current.timer)
    const run = async () => {
      colorSave.current = null
      try {
        await updateAccount(accountId, { cardColor: color })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save card colour')
      } finally {
        setPendingColor(null)
      }
    }
    colorSave.current = { timer: setTimeout(run, 400), save: run }
  }

  function handleCardPhoto(file: File) {
    if (!account) return
    if (file.size > MAX_CARD_PHOTO_BYTES) {
      setError('Card photo must be 5 MB or smaller')
      return
    }
    void save(() => uploadCardImage(account.id, file), 'Failed to upload card photo')
  }

  return (
    <main className="settings-page">
      <PageHeader title={account.name} backTo={backToAccount} />
      <p className="settings-page-subtitle">Account settings</p>
      {error && <Alert variant="error">{error}</Alert>}

      <SettingsSection title="Details">
        <div className="settings-fields">
          <label>
            Name
            <input type="text" defaultValue={account.name} disabled={saving} onBlur={(e) => handleField('name', e.target.value)} />
          </label>
          <div className="settings-field-row">
            <label>
              Type
              <FieldSelect value={account.type} options={ACCOUNT_TYPE_OPTIONS} disabled={saving} onChange={(type) => handleField('type', type)} />
            </label>
            <label>
              Currency
              <FieldSelect
                value={account.currencyCode}
                options={currencyOptions}
                disabled={saving}
                onChange={(currencyCode) => handleField('currencyCode', currencyCode)}
              />
            </label>
          </div>
          <label>
            Institution
            <input type="text" defaultValue={account.institution ?? ''} disabled={saving} onBlur={(e) => handleField('institution', e.target.value)} />
          </label>
        </div>
      </SettingsSection>

      <SettingsSection title="Balance" hint="Transactions dated after the “as of” day are added to this starting balance.">
        <div key={account.balanceUpdatedAt} className="settings-field-row">
          <label>
            Starting balance
            <input
              type="number"
              step="0.01"
              defaultValue={account.startingBalance}
              disabled={saving}
              onBlur={(e) => handleField('startingBalance', e.target.value)}
            />
          </label>
          <label>
            As of
            <FieldDatePicker required value={account.balanceAsOf} disabled={saving} onChange={(balanceAsOf) => handleField('balanceAsOf', balanceAsOf)} />
          </label>
        </div>
        <SettingsRow label="Balance changed?" detail="Set what the account holds today; past transactions stay as they are.">
          <Button variant="secondary" onClick={() => setShowUpdateBalance(true)}>
            Update balance
          </Button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Card">
        <CardAppearanceEditor
          name={account.name}
          color={pendingColor ?? account.cardColor}
          photoUrl={account.cardImageUrl}
          busy={saving}
          onColorChange={handleColorChange}
          onPhotoSelected={handleCardPhoto}
          onRemovePhoto={() => void save(() => removeCardImage(account.id), 'Failed to remove card photo')}
        />
      </SettingsSection>

      <SettingsSection title="CSV import">
        <SettingsRow label="This account can export transactions as CSV">
          <SegmentedControl
            ariaLabel="CSV import"
            value={account.csvImportEnabled ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'Yes' },
              { value: 'off', label: 'No' },
            ]}
            onChange={(value) => void save(() => updateAccount(account.id, { csvImportEnabled: value === 'on' }), 'Failed to save')}
          />
        </SettingsRow>
        {account.csvImportEnabled ? (
          <SettingsRow
            label={profile ? 'CSV profile' : 'No CSV profile yet'}
            detail={profile ? profile.name : 'Set one up to import this account’s CSV exports.'}
          >
            {profile ? (
              <>
                <Button variant="secondary" onClick={() => setCsvWizard({ existingProfileId: profile.id })}>
                  Redo setup
                </Button>
                <Button variant="danger" onClick={() => setConfirming('delete-profile')}>
                  Delete
                </Button>
              </>
            ) : (
              <Button variant="primary" onClick={() => setCsvWizard({ existingProfileId: null })}>
                Set up CSV profile
              </Button>
            )}
          </SettingsRow>
        ) : (
          <p className="settings-section-hint">Transactions are added by hand{profile ? '. Its CSV profile is kept in case you turn this back on.' : '.'}</p>
        )}
      </SettingsSection>

      <SettingsSection title="Remove account">
        <SettingsRow label="Archive or delete this account" detail="Archiving hides it and keeps its history; deleting is permanent.">
          <Button variant="danger" onClick={() => setConfirming('remove-account')}>
            Remove…
          </Button>
        </SettingsRow>
      </SettingsSection>

      {showUpdateBalance && (
        <UpdateBalanceModal open={showUpdateBalance} onClose={() => setShowUpdateBalance(false)} account={account} updateAccount={updateAccount} />
      )}

      {csvWizard && (
        <CsvWizardHost
          open
          onClose={() => setCsvWizard(null)}
          start={{ kind: 'profile', accountId: account.id, existingProfileId: csvWizard.existingProfileId }}
          onProfileSaved={() => void refreshProfiles()}
          onImported={(accountId) => navigate(`/accounts?selected=${accountId}`)}
        />
      )}

      {confirming === 'delete-profile' && profile && (
        <ConfirmModal
          title="Delete this CSV profile?"
          body={`${account.name} won’t be able to import CSVs until you set up a new profile. Transactions already imported stay.`}
          actions={[{ label: 'Delete profile', variant: 'danger', run: () => deleteProfile(profile.id) }]}
          onClose={() => setConfirming(null)}
        />
      )}

      {confirming === 'remove-account' && (
        <ConfirmModal
          title={`Remove “${account.name}”?`}
          body={
            <>
              <p className="category-delete-text">
                <strong>Archive</strong> – Hides it from your accounts and totals. Its transactions are kept.
              </p>
              <p className="category-delete-text">
                <strong className="category-delete-danger">Delete permanently</strong> – Only for accounts with no transactions and no CSV profile.
                This can’t be undone.
              </p>
            </>
          }
          actions={[
            {
              label: 'Delete permanently',
              variant: 'danger',
              run: async () => {
                try {
                  await deleteAccount(account.id)
                } catch {
                  throw new Error('This account has transactions or a CSV profile, so it can only be archived.')
                }
                navigate('/accounts')
              },
            },
            {
              label: 'Archive',
              variant: 'primary',
              run: async () => {
                await updateAccount(account.id, { isArchived: true })
                navigate('/accounts')
              },
            },
          ]}
          onClose={() => setConfirming(null)}
        />
      )}
    </main>
  )
}

interface ConfirmAction {
  label: string
  variant: 'primary' | 'danger'
  run: () => Promise<unknown>
}

/** A destructive-action confirmation in the app's own modal; errors stay inside it. */
function ConfirmModal({ title, body, actions, onClose }: { title: string; body: ReactNode; actions: ConfirmAction[]; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(action: ConfirmAction) {
    setBusy(action.label)
    setError(null)
    try {
      await action.run()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      {typeof body === 'string' ? <p className="category-delete-text">{body}</p> : body}
      {error && <Alert variant="error">{error}</Alert>}
      <div className="settings-confirm-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy !== null}>
          Cancel
        </Button>
        {actions.map((action) => (
          <Button key={action.label} variant={action.variant} loading={busy === action.label} disabled={busy !== null} onClick={() => handle(action)}>
            {action.label}
          </Button>
        ))}
      </div>
    </Modal>
  )
}
