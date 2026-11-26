import { useMemo, useState } from 'react'
import { computeSplit, type SplitMode, type Transaction, type TransactionSplit } from 'shared-types'
import { WizardModal, type WizardStepDef } from '../../components/WizardModal'
import { WizardStep } from '../../components/WizardFooter'
import { Alert } from '../../components/Alert'
import { SegmentedControl } from '../../components/SegmentedControl'
import { SkeletonBlock } from '../../components/Skeleton'
import { formatCurrency } from '../../lib/formatCurrency'
import { apiErrorMessage, peopleApi, useContacts, useTransactionPeople } from '../../hooks/usePeople'
import { ContactPicker } from './ContactPicker'
import { PersonInitials } from './PersonInitials'

interface SplitWizardProps {
  transaction: Transaction
  onClose: () => void
}

type Step = 'people' | 'split'

const STEPS: WizardStepDef[] = [
  { key: 'people', label: 'People' },
  { key: 'split', label: 'Split' },
]

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'amount', label: 'Amount' },
  { value: 'percent', label: '%' },
]

const PROBLEMS = {
  over_total: 'The amounts add up to more than the transaction.',
  zero_share: 'Everyone needs a share above zero.',
  percent_over_100: 'The percentages add up to more than 100%.',
  no_shares: 'Give at least one person a share.',
} as const

/**
 * Tag a transaction with people, as a two-step wizard: who's in on it, then
 * how it's split. On an expense, each person's part is what they owe the
 * user (the user left out is a loan). On money in, it's what they sent.
 * Editing an existing split opens on the second step.
 */
export function SplitWizard({ transaction, onClose }: SplitWizardProps) {
  const { details, loading } = useTransactionPeople(transaction.id)
  const spending = transaction.amount < 0
  const title = details?.split ? 'Edit people' : spending ? 'Split with people' : 'Received from someone'
  const subtitle = `${transaction.description || 'Untitled'} · ${formatCurrency(transaction.amount, transaction.currencyCode)}`

  if (loading || !details) {
    return (
      <WizardModal open title={title} subtitle={subtitle} steps={STEPS} currentStep="people" onClose={onClose}>
        <SkeletonBlock height="16rem" />
      </WizardModal>
    )
  }
  return <SplitFlow transaction={transaction} existing={details.split} title={title} subtitle={subtitle} onClose={onClose} />
}

interface Draft {
  contactId: string
  value: string
}

interface SplitFlowProps {
  transaction: Transaction
  existing: TransactionSplit | null
  title: string
  subtitle: string
  onClose: () => void
}

function SplitFlow({ transaction, existing, title, subtitle, onClose }: SplitFlowProps) {
  const { contacts } = useContacts()
  const total = Math.abs(transaction.amount)
  const currency = transaction.currencyCode
  const spending = transaction.amount < 0
  const [step, setStep] = useState<Step>(existing ? 'split' : 'people')
  const [mode, setMode] = useState<SplitMode>(existing?.mode ?? 'equal')
  // Money in usually all came from them; an expense usually includes the user.
  const [includeMe, setIncludeMe] = useState(existing ? existing.myValue > 0 : spending)
  const [people, setPeople] = useState<Draft[]>(existing?.participants.map((p) => ({ contactId: p.contactId, value: String(p.value) })) ?? [])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const result = useMemo(
    () => (people.length ? computeSplit(total, mode, people.map((p) => Number(p.value) || 0), { myValue: includeMe ? 1 : 0 }) : null),
    [total, mode, includeMe, people],
  )
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.displayName ?? '…'

  /** Switching mode starts each person from a sensible value for it. */
  function changeMode(next: SplitMode) {
    const current = result?.shares ?? []
    setPeople((list) =>
      list.map((p, i) => ({
        ...p,
        value: next === 'amount' ? String(current[i] ?? 0) : next === 'percent' ? String(Math.floor(100 / (list.length + (includeMe ? 1 : 0)))) : p.value,
      })),
    )
    setMode(next)
    setDirty(true)
  }

  function setSelected(ids: string[]) {
    setPeople((list) => {
      const kept = list.filter((p) => ids.includes(p.contactId))
      const added = ids.filter((id) => !list.some((p) => p.contactId === id)).map((id) => ({ contactId: id, value: '0' }))
      return [...kept, ...added]
    })
    setDirty(true)
  }

  async function save() {
    if (!result || result.problem) return
    setSaving(true)
    setError(null)
    try {
      await peopleApi.setSplit(transaction.id, {
        mode,
        myValue: includeMe ? 1 : 0,
        participants: people.map((p) => ({ contactId: p.contactId, value: Number(p.value) || 0 })),
      })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save'))
      setSaving(false)
    }
  }

  return (
    <WizardModal open title={title} subtitle={subtitle} steps={STEPS} currentStep={step} dirty={dirty} onClose={onClose}>
      {step === 'people' && (
        <WizardStep onSubmit={() => setStep('split')} footer={{ primary: { label: 'Continue', disabled: people.length === 0 } }}>
          <section className="wizard-question">
            <h2>{spending ? 'Who’s in on this?' : 'Who sent it?'}</h2>
            <ContactPicker multiple selectedIds={people.map((p) => p.contactId)} onChange={setSelected} />
          </section>
        </WizardStep>
      )}

      {step === 'split' && result && (
        <WizardStep
          onSubmit={() => void save()}
          footer={{
            back: { label: 'Back', onClick: () => setStep('people') },
            primary: { label: 'Save', disabled: !!result.problem, loading: saving },
          }}
        >
          <section className="wizard-question">
            <h2>{spending ? 'How is it split?' : 'How much did each send?'}</h2>
            <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={changeMode} ariaLabel="How to split" />
            <ul className="split-rows">
              <li className="split-row">
                <span className="person-initials is-me" aria-hidden="true">
                  You
                </span>
                <span className="split-row-name">You</span>
                {mode === 'equal' && (
                  <label className="split-row-include">
                    <input type="checkbox" checked={includeMe} onChange={(e) => {
                        setIncludeMe(e.target.checked)
                        setDirty(true)
                      }} />
                    Include me
                  </label>
                )}
                <span className="split-row-amount mono">{formatCurrency(result.myShare, currency)}</span>
              </li>
              {people.map((p, i) => (
                <li key={p.contactId} className="split-row">
                  <PersonInitials name={nameOf(p.contactId)} />
                  <span className="split-row-name">{nameOf(p.contactId)}</span>
                  {mode !== 'equal' && (
                    <input
                      className="split-row-input"
                      inputMode="decimal"
                      aria-label={`${nameOf(p.contactId)} ${mode === 'amount' ? 'amount' : 'percent'}`}
                      value={p.value}
                      onChange={(e) => {
                        setPeople((list) => list.map((d, j) => (j === i ? { ...d, value: e.target.value } : d)))
                        setDirty(true)
                      }}
                    />
                  )}
                  <span className="split-row-amount mono">{formatCurrency(result.shares[i], currency)}</span>
                </li>
              ))}
            </ul>
            {result.problem && <Alert variant="error">{PROBLEMS[result.problem]}</Alert>}
          </section>
          {error && <Alert variant="error">{error}</Alert>}
        </WizardStep>
      )}
    </WizardModal>
  )
}
