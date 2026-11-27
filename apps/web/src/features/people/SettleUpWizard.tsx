import { useState, type ReactNode } from 'react'
import type { PaymentAllocation as Allocation, PersonSummary } from 'shared-types'
import { WizardModal, type WizardStepDef } from '../../components/WizardModal'
import { WizardStep } from '../../components/WizardFooter'
import { ChoiceCard } from '../../components/ChoiceCard'
import { Alert } from '../../components/Alert'
import { AccountSelect } from '../../components/AccountSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { CheckIcon, LinkIcon, PencilLineIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { useAccounts } from '../../hooks/useAccounts'
import { apiErrorMessage, peopleApi, usePerson, useSettleUpCandidates } from '../../hooks/usePeople'
import { TransactionPicker, type PickableTransaction } from '../groups/TransactionPicker'
import { PaymentAllocation } from '../groups/PaymentAllocation'
import { autoAllocate, payableGroups } from '../groups/allocation'
import { balancesDetail } from './peopleText'

type Method = 'forgive' | 'match' | 'new'
type Step = 'how' | Method | 'allocate'

const STEPS: WizardStepDef[] = [
  { key: 'how', label: 'How' },
  { key: 'details', label: 'Details' },
]

const MATCH_STEPS: WizardStepDef[] = [
  { key: 'how', label: 'How' },
  { key: 'details', label: 'Payment' },
  { key: 'allocate', label: 'For' },
]

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface SettleUpWizardProps {
  summary: PersonSummary
  onClose: () => void
}

/**
 * Settle up with a person: forgive what's left (each group's share goes back
 * on the user), match the transaction that paid it (divided between the
 * groups it pays for), or add that transaction. When balances only cancel
 * out across currencies, forgiving is the only way.
 */
export function SettleUpWizard({ summary, onClose }: SettleUpWizardProps) {
  const { contact, net, homeCurrencyCode } = summary
  const name = contact.displayName
  const theyOwe = net > 0
  const owed = formatCurrency(Math.abs(net), homeCurrencyCode)
  const withTransaction = net !== 0

  const [step, setStep] = useState<Step>('how')
  const [payment, setPayment] = useState<PickableTransaction | null>(null)
  const [allocations, setAllocations] = useState<Allocation[] | null>(null)
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
      // Matching has a third step: what the payment is for.
      steps={step === 'match' || step === 'allocate' ? MATCH_STEPS : STEPS}
      currentStep={step === 'how' ? 'how' : step === 'allocate' ? 'allocate' : 'details'}
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
                detail={net === 0 ? 'Clears each currency' : theyOwe ? `You cover the ${owed} yourself` : `You keep the ${owed}`}
                selected={false}
                onSelect={() => setStep('forgive')}
              />
              <ChoiceCard
                icon={<LinkIcon />}
                title="Match a payment"
                detail={theyOwe ? `The money ${name} sent you` : `The money you sent ${name}`}
                selected={false}
                disabled={!withTransaction}
                onSelect={() => setStep('match')}
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
                  ? `${name}’s ${owed} is cleared. Each share goes back on you, in the month of what it was for.`
                  : `The ${owed} you owe ${name} is cleared. Each part comes off what it was for, in its month.`}
            </p>
            {balancesDetail(summary) && <p className="wizard-hint">{balancesDetail(summary)}</p>}
          </section>
          {errorAlert}
        </WizardStep>
      )}

      {step === 'match' && (
        <MatchStep
          contactId={contact.id}
          theyOwe={theyOwe}
          name={name}
          selected={payment}
          back={back}
          onPick={(item) => {
            setPayment(item)
            setAllocations(null)
            setStep('allocate')
          }}
        />
      )}

      {step === 'allocate' && payment && (
        <WizardStep
          onSubmit={() => allocations && void settle({ method: 'match', transactionId: payment.id, allocations })}
          footer={{ back: { label: 'Back', onClick: () => setStep('match') }, primary: { label: 'Save', disabled: !allocations, loading: saving } }}
        >
          <section className="wizard-question">
            <h2>What does it pay for?</h2>
            <PaymentAllocation contactId={contact.id} name={name} available={payment.available} currencyCode={payment.currencyCode} onChange={setAllocations} />
          </section>
          {errorAlert}
        </WizardStep>
      )}

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

function MatchStep({
  contactId,
  theyOwe,
  name,
  selected,
  back,
  onPick,
}: {
  contactId: string
  theyOwe: boolean
  name: string
  selected: PickableTransaction | null
  back: { label: string; onClick: () => void }
  onPick: (item: PickableTransaction) => void
}) {
  const { candidates, loading } = useSettleUpCandidates(contactId)
  return (
    <WizardStep footer={{ back }}>
      <section className="wizard-question">
        <h2>{theyOwe ? `Which transaction is ${name}’s payment?` : `Which transaction paid ${name}?`}</h2>
        <TransactionPicker
          items={candidates}
          loading={loading}
          selectedId={selected?.id ?? null}
          onPick={onPick}
          emptyText={theyOwe ? 'No money received to match.' : 'No payments to match.'}
        />
      </section>
    </WizardStep>
  )
}

function NewStep({
  summary,
  back,
  saving,
  error,
  onSave,
}: DetailStepProps & {
  summary: PersonSummary
  onSave: (input: { accountId: string; amount: number; date: string; description: string; allocations: Allocation[] }) => void
}) {
  const { accounts } = useAccounts()
  const { person } = usePerson(summary.contact.id)
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
  // The new payment goes to what's expected in its currency, oldest first.
  const signed = theyOwe ? value : -value
  const payable = account ? payableGroups(person?.groups ?? [], signed, account.currencyCode) : []
  const allocations = value > 0 ? autoAllocate(payable, signed) : []
  const nothingInCurrency = !!account && !!person && payable.length === 0
  const valid = !!account && value > 0 && !!date && description.trim().length > 0 && allocations.length > 0

  return (
    <WizardStep
      onSubmit={() => valid && onSave({ accountId: account.id, amount: value, date, description: description.trim(), allocations })}
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
        {nothingInCurrency && <p className="wizard-hint">Nothing in {account.currencyCode} is expected with {name}. Pick an account in the currency of what they owe.</p>}
      </section>
      {error}
    </WizardStep>
  )
}
