import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { SegmentedControl } from '../../components/SegmentedControl'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { FieldSelect } from '../../components/FieldSelect'
import { apiErrorMessage, peopleApi } from '../../hooks/usePeople'

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Money that changed hands with a person outside any tracked account. */
export function CashSheet({ contactId, name, currencies, onClose }: { contactId: string; name: string; currencies: string[]; onClose: () => void }) {
  const [direction, setDirection] = useState<'they_paid' | 'i_paid'>('they_paid')
  const [amount, setAmount] = useState('')
  const [currencyCode, setCurrencyCode] = useState(currencies[0] ?? '')
  const [date, setDate] = useState(todayISO())
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const value = Number(amount)

  async function save() {
    if (!(value > 0) || !currencyCode) return
    setSaving(true)
    setError(null)
    try {
      await peopleApi.recordCash(contactId, { direction, amount: value, currencyCode, date, note: note.trim() || null })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t record it'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Record cash payment" size="sm">
      <div className="people-sheet">
        <SegmentedControl
          value={direction}
          options={[
            { value: 'they_paid', label: `${name} paid me` },
            { value: 'i_paid', label: `I paid ${name}` },
          ]}
          onChange={setDirection}
          ariaLabel="Who paid"
        />
        <div className="people-sheet-row">
          <label>
            Amount
            <input type="text" inputMode="decimal" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
          </label>
          {currencies.length > 1 && (
            <label>
              Currency
              <FieldSelect value={currencyCode} options={currencies.map((c) => ({ value: c, label: c }))} searchable={false} onChange={setCurrencyCode} />
            </label>
          )}
          <label>
            Date
            <FieldDatePicker value={date} onChange={setDate} max={todayISO()} />
          </label>
        </div>
        <label>
          Note
          <input type="text" maxLength={500} value={note} placeholder="Optional" onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="people-sheet-hint">For money that isn’t in any of your accounts. A bank transfer is better tagged from Transactions.</p>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="people-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!(value > 0)}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  )
}
