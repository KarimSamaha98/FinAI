import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AccountSummary, AccountType, CreateAccountInput } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/accountTypes'
import { CURRENCY_CODES } from '../../lib/currencies'
import { CardAppearanceEditor, MAX_CARD_PHOTO_BYTES } from './CardAppearanceEditor'

interface AccountFormProps {
  open: boolean
  onClose: () => void
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>
  uploadCardImage: (accountId: string, file: File) => Promise<void>
  /** Pre-selected card colour — the next one in the palette. */
  defaultCardColor: string
  onCreated: (accountId: string) => void
}

export function AccountForm({ open, onClose, createAccount, uploadCardImage, defaultCardColor, onCreated }: AccountFormProps) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [institution, setInstitution] = useState('')
  const [currencyCode, setCurrencyCode] = useState('USD')
  const [startingBalance, setStartingBalance] = useState('0')
  const [balanceAsOf, setBalanceAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [cardColor, setCardColor] = useState(defaultCardColor)
  const [cardPhoto, setCardPhoto] = useState<File | null>(null)
  const [setUpImport, setSetUpImport] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cardPhotoUrl = useMemo(() => (cardPhoto ? URL.createObjectURL(cardPhoto) : null), [cardPhoto])
  useEffect(() => () => {
    if (cardPhotoUrl) URL.revokeObjectURL(cardPhotoUrl)
  }, [cardPhotoUrl])

  function handlePhotoSelected(file: File) {
    if (file.size > MAX_CARD_PHOTO_BYTES) {
      setError('Card photo must be 5 MB or smaller')
      return
    }
    setError(null)
    setCardPhoto(file)
  }

  async function handleSubmit() {
    setError(null)
    const balance = Number(startingBalance)
    if (!name.trim()) {
      setError('Enter an account name')
      return
    }
    if (!Number.isFinite(balance)) {
      setError('Enter a valid starting balance')
      return
    }
    setSubmitting(true)
    try {
      const input: CreateAccountInput = { name, type, institution: institution || null, currencyCode, startingBalance: balance, balanceAsOf, cardColor }
      const account = await createAccount(input)
      if (cardPhoto) {
        try {
          await uploadCardImage(account.id, cardPhoto)
        } catch {
          // The account exists either way — the photo can be added again from its settings.
        }
      }
      onCreated(account.id)
      onClose()
      if (setUpImport) navigate(`/accounts/${account.id}/import`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="New account">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CIBC Costco" />
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <label style={{ flex: 1 }}>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            Currency
            <select value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Institution (optional)
          <input type="text" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. CIBC" />
        </label>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <label style={{ flex: 1 }}>
            Current balance
            <input type="number" step="0.01" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
          </label>
          <label style={{ flex: 1 }}>
            as of
            <input type="date" value={balanceAsOf} onChange={(e) => setBalanceAsOf(e.target.value)} />
          </label>
        </div>
        <CardAppearanceEditor
          name={name}
          color={cardColor}
          photoUrl={cardPhotoUrl}
          busy={submitting}
          onColorChange={setCardColor}
          onPhotoSelected={handlePhotoSelected}
          onRemovePhoto={() => setCardPhoto(null)}
        />
        <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <input type="radio" checked={setUpImport} onChange={() => setSetUpImport(true)} /> Set up CSV import now
          </label>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: '0.4rem' }}>
            <input type="radio" checked={!setUpImport} onChange={() => setSetUpImport(false)} /> Skip for now
          </label>
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={submitting}>
            Create
          </Button>
        </div>
      </div>
    </Modal>
  )
}
