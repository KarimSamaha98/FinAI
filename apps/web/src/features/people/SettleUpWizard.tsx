import { useState, type ReactNode } from 'react'
import type { PersonSummary } from 'shared-types'
import { WizardModal, type WizardStepDef } from '../../components/WizardModal'
import { WizardStep } from '../../components/WizardFooter'
import { ChoiceCard } from '../../components/ChoiceCard'
import { Alert } from '../../components/Alert'
import { AccountSelect } from '../../components/AccountSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { SearchInput } from '../../components/SearchInput'
import { SkeletonBlock } from '../../components/Skeleton'
import { CheckIcon, LinkIcon, PencilLineIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { useAccounts } from '../../hooks/useAccounts'
import { apiErrorMessage, peopleApi, useSettleUpCandidates } from '../../hooks/usePeople'
import { balancesDetail } from './peopleText'

type Method = 'forgive' | 'link' | 'new'
type Step = 'how' | Method

const STEPS: WizardStepDef[] = [
  { key: 'how', label: 'How' },
  { key: 'details', label: 'Details' },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface SettleUpWizardProps {
  summary: PersonSummary
  onClose: () => void
}

/**
 * Settle up with a person: forgive what's left (it becomes spending or
 * income today), link the transaction that paid it, or add that transaction.
 * When balances only cancel out across currencies, forgiving is the only way.
 */
export function SettleUpWizard({ summary, onClose }: SettleUpWizardProps) {
  const { contact, net, homeCurrencyCode } = summary
  const name = contact.displayName
  const theyOwe = net > 0
  const owed = formatCurrency(Math.abs(net), homeCurrencyCode)
  const withTransaction = net !== 0

  const [step, setStep] = useState<Step>('how')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function settle(input: Parameters<typeof peopleApi.settleUp>[1]) {
    setSaving(true)
    setError(null)
    try {
      await peopleApi.settleUp(contact.id, input)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t settle up'))
      setSaving(false)
    }
  }

  const back = { label: 'Back', onClick: () => setStep('how') }
  const errorAlert = error && <Alert variant="error">{error}</Alert>

  return (
    <WizardModal
      open
      title={`Settle up with ${name}`}
      subtitle={net === 0 ? 'Balances cancel out across currencies' : theyOwe ? `${name} owes you ${owed}` : `You owe ${name} ${owed}`}
      steps={STEPS}
      currentStep={step === 'how' ? 'how' : 'details'}
      stepKey={step}
      dirty={step !== 'how'}
      onClose={onClose}
    >
      {step === 'how' && (
        <WizardStep footer={{}}>
          <section className="wizard-question">
            <h2>How do you want to settle up?</h2>
            <div className="wizard-choices wizard-choices--stacked">
              <ChoiceCard
                icon={<CheckIcon />}
                title="Forgive what’s left"
                detail={net === 0 ? 'Clears each currency' : theyOwe ? `${owed} counts as spending today` : `${owed} counts as income today`}
                selected={false}
                onSelect={() => setStep('forgive')}
              />
              <ChoiceCard
                icon={<LinkIcon />}
                title="Link a transaction"
                detail={theyOwe ? `The money ${name} sent you` : `The money you sent ${name}`}
                selected={false}
                disabled={!withTransaction}
                onSelect={() => setStep('link')}
              />
              <ChoiceCard
                icon={<PencilLineIcon />}
                title="Add a new transaction"
                detail="Cash, or a payment that isn’t in your accounts yet"
                selected={false}
                disabled={!withTransaction}
                onSelect={() => setStep('new')}
              />
            </div>
          </section>
        </WizardStep>
      )}

      {step === 'forgive' && (
        <WizardStep onSubmit={() => void settle({ method: 'forgive' })} footer={{ back, primary: { label: 'Forgive', loading: saving } }}>
          <section className="wizard-question">
            <h2>Forgive what’s left?</h2>
            <p className="wizard-hint">
              {net === 0
                ? `Your balances with ${name} cancel out across currencies. This clears each of them.`
                : theyOwe
                  ? `${name}’s ${owed} is cleared and counts as your spending today.`
                  : `The ${owed} you owe ${name} is cleared and counts as income today.`}
            </p>
            {balancesDetail(summary) && <p className="wizard-hint">{balancesDetail(summary)}</p>}
          </section>
          {errorAlert}
        </WizardStep>
      )}

      {step === 'link' && <LinkStep contactId={contact.id} theyOwe={theyOwe} name={name} back={back} saving={saving} error={errorAlert} onLink={(transactionId) => void settle({ method: 'link', transactionId })} />}

      {step === 'new' && (
        <NewStep
          summary={summary}
          back={back}
          saving={saving}
          error={errorAlert}
          onSave={(input) => void settle({ method: 'new', ...input })}
        />
      )}
    </WizardModal>
  )
}

interface DetailStepProps {
  back: { label: string; onClick: () => void }
  saving: boolean
  error: ReactNode
}

function LinkStep({ contactId, theyOwe, name, back, saving, error, onLink }: DetailStepProps & { contactId: string; theyOwe: boolean; name: string; onLink: (id: string) => void }) {
  const { candidates, loading } = useSettleUpCandidates(contactId)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const term = query.trim().toLowerCase()
  const visible = term ? candidates.filter((c) => c.description.toLowerCase().includes(term)) : candidates

  return (
    <WizardStep onSubmit={() => selected && onLink(selected)} footer={{ back, primary: { label: 'Link', disabled: !selected, loading: saving } }}>
      <section className="wizard-question">
        <h2>{theyOwe ? `Which transaction is ${name}’s payment?` : `Which transaction paid ${name}?`}</h2>
        <SearchInput value={query} onChange={setQuery} aria-label="Search transactions" />
        {loading ? (
          <SkeletonBlock height="12rem" />
        ) : visible.length === 0 ? (
          <p className="wizard-hint">{theyOwe ? 'No money received to link.' : 'No payments to link.'}</p>
        ) : (
          <ul className="settle-candidates" role="listbox" aria-label="Transactions">
            {visible.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected === c.id}
                  className={`settle-candidate${selected === c.id ? ' is-selected' : ''}`}
                  onClick={() => setSelected(c.id)}
                >
                  <span className="settle-candidate-main">
                    <span className="settle-candidate-title">{c.description || 'Untitled'}</span>
                    <span className="settle-candidate-sub">
                      {formatDate(c.date)}
                      {c.accountName && ` · ${c.accountName}`}
                    </span>
                  </span>
                  <span className="mono">{formatCurrency(c.amount, c.currencyCode)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {error}
    </WizardStep>
  )
}

function NewStep({
  summary,
  back,
  saving,
  error,
  onSave,
}: DetailStepProps & { summary: PersonSummary; onSave: (input: { accountId: string; amount: number; date: string; description: string }) => void }) {
  const { accounts } = useAccounts()
  const open = accounts.filter((a) => !a.isArchived)
  const name = summary.contact.displayName
  const theyOwe = summary.net > 0
  const [accountId, setAccountId] = useState<string | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState(theyOwe ? `From ${name}` : `To ${name}`)

  const account = open.find((a) => a.id === accountId) ?? null
  /** Starts from what's owed in the account's currency. */
  function suggested(currencyCode: string | undefined): string {
    if (!currencyCode) return ''
    const balance = summary.balances.find((b) => b.currencyCode === currencyCode)
    if (balance) return String(Math.abs(balance.amount))
    return currencyCode === summary.homeCurrencyCode ? String(Math.abs(summary.net)) : ''
  }
  const amountValue = amount ?? suggested(account?.currencyCode)
  const value = Number(amountValue)
  const valid = !!account && value > 0 && !!date && description.trim().length > 0

  return (
    <WizardStep
      onSubmit={() => valid && onSave({ accountId: account.id, amount: value, date, description: description.trim() })}
      footer={{ back, primary: { label: 'Save', disabled: !valid, loading: saving } }}
    >
      <section className="wizard-question">
        <h2>{theyOwe ? `Where did ${name}’s money go?` : `Which account did you pay from?`}</h2>
        <div className="wizard-fields">
          <label>
            Account
            <AccountSelect accounts={open} value={accountId} onChange={setAccountId} required />
          </label>
          <div className="wizard-field-row">
            <label className="wizard-inline-field">
              Amount{account ? ` (${account.currencyCode})` : ''}
              <input type="text" inputMode="decimal" value={amountValue} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="wizard-inline-field">
              Date
              <FieldDatePicker value={date} onChange={setDate} max={todayISO()} />
            </label>
          </div>
          <label>
            Description
            <input type="text" maxLength={200} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
      </section>
      {error}
    </WizardStep>
  )
}
