import { useMemo, useState } from 'react'
import { computeSplit, shareAmount, shareOutstanding, type Group, type PaymentAllocation as Allocation, type SplitMode } from 'shared-types'
import { WizardModal, type WizardStepDef } from '../../components/WizardModal'
import { WizardStep } from '../../components/WizardFooter'
import { Alert } from '../../components/Alert'
import { SegmentedControl } from '../../components/SegmentedControl'
import { Button } from '../../components/Button'
import { ChevronRightIcon, CloseIcon, PeopleIcon, PlusIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { useGroupCandidates, groupsApi } from '../../hooks/useGroups'
import { apiErrorMessage, peopleApi, useContacts, usePeople } from '../../hooks/usePeople'
import { ContactPicker } from '../people/ContactPicker'
import { PersonInitials } from '../people/PersonInitials'
import { TransactionPicker, type PickableTransaction } from './TransactionPicker'
import { PaymentAllocation } from './PaymentAllocation'

/** The transaction the Group action was used on. */
export interface GroupMainTransaction {
  id: string
  date: string
  description: string
  amount: number
  currencyCode: string
}

interface GroupWizardProps {
  /** A new group starts from this transaction. */
  transaction?: GroupMainTransaction
  /** Or an existing group is edited. */
  group?: Group
  onClose: () => void
}

/** One of the user's own transactions in the group, with the part of it that's in. */
interface OwnItem {
  transactionId: string
  description: string
  date: string
  /** The part in the group, signed like the transaction. */
  amount: number
  transactionAmount: number
}

interface Payment {
  transactionId: string
  description: string
  date: string
  /** The part for this group, signed like the transaction. */
  amount: number
}

interface PersonDraft {
  contactId: string
  value: string
  payments: Payment[]
  /** Forgiven before (editing): it stays while the share still covers it. */
  forgiven: number
}

type Step = 'with' | 'split' | 'payback'

const MODE_OPTIONS: { value: SplitMode; label: string }[] = [
  { value: 'equal', label: 'Equal' },
  { value: 'amount', label: 'Amount' },
  { value: 'percent', label: '%' },
]

const PROBLEMS = {
  over_total: 'The amounts add up to more than the total.',
  zero_share: 'Everyone needs a share above zero.',
  percent_over_100: 'The percentages add up to more than 100%.',
  no_shares: 'Give at least one person a share.',
} as const

const toCents = (value: number) => Math.round(value * 100)
const today = new Date().toISOString().slice(0, 10)
const sumOf = (values: number[]) => values.reduce((sum, v) => sum + toCents(v), 0) / 100

/**
 * The one workflow for putting things together: a transaction with other
 * transactions (a refund, a card payment), with people who share it (each
 * owes their part, paid already or still expected), or both at once. Money
 * coming in can instead pay back what someone owes. Editing a group opens
 * the same wizard.
 */
export function GroupWizard({ transaction, group, onClose }: GroupWizardProps) {
  const { people } = usePeople()
  const main: GroupMainTransaction = group
    ? (() => {
        const anchor = group.members.find((m) => m.transactionId === group.anchorTransactionId)!
        return { id: anchor.transactionId, date: anchor.date, description: anchor.description, amount: anchor.transactionAmount, currencyCode: group.currencyCode }
      })()
    : transaction!
  // A new group from a payment some people's balances could take: offer to pay them back.
  const canPayBack = !group && (people?.people ?? []).some((p) => p.balances.some((b) => b.currencyCode === main.currencyCode && Math.sign(b.amount) === Math.sign(main.amount)))
  return <GroupWizardSteps main={main} group={group ?? null} canPayBack={canPayBack} onClose={onClose} />
}

function GroupWizardSteps({ main, group, canPayBack, onClose }: { main: GroupMainTransaction; group: Group | null; canPayBack: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>('with')
  const title = group ? 'Edit group' : 'Group'
  const subtitle = `${main.description || 'Untitled'} · ${formatCurrency(main.amount, main.currencyCode)}`

  if (step === 'payback') {
    const steps: WizardStepDef[] = [
      { key: 'with', label: 'With' },
      { key: 'payback', label: 'Pay back' },
    ]
    return (
      <WizardModal open title={title} subtitle={subtitle} steps={steps} currentStep="payback" dirty onClose={onClose}>
        <PayBackStep main={main} onBack={() => setStep('with')} onDone={onClose} />
      </WizardModal>
    )
  }
  const steps: WizardStepDef[] = [
    { key: 'with', label: 'With' },
    { key: 'split', label: 'Split' },
  ]
  return (
    <GroupFlow
      main={main}
      group={group}
      title={title}
      subtitle={subtitle}
      steps={steps}
      step={step}
      setStep={setStep}
      onPayBack={canPayBack ? () => setStep('payback') : null}
      onClose={onClose}
    />
  )
}

/** Money in (or out) that pays back what one person owes (or is owed), divided between their groups. */
function PayBackStep({ main, onBack, onDone }: { main: GroupMainTransaction; onBack: () => void; onDone: () => void }) {
  const { people } = usePeople()
  const eligible = (people?.people ?? []).filter((p) => p.balances.some((b) => b.currencyCode === main.currencyCode && Math.sign(b.amount) === Math.sign(main.amount)))
  const [contactId, setContactId] = useState<string | null>(eligible.length === 1 ? eligible[0].contact.id : null)
  const [allocations, setAllocations] = useState<Allocation[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const name = eligible.find((p) => p.contact.id === contactId)?.contact.displayName ?? ''

  async function save() {
    if (!contactId || !allocations) return
    setSaving(true)
    setError(null)
    try {
      await peopleApi.settleUp(contactId, { method: 'match', transactionId: main.id, allocations })
      onDone()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save'))
      setSaving(false)
    }
  }

  return (
    <WizardStep
      onSubmit={() => void save()}
      footer={{ back: { label: 'Back', onClick: onBack }, primary: { label: 'Save', disabled: !contactId || !allocations, loading: saving } }}
    >
      <section className="wizard-question">
        <h2>{main.amount > 0 ? 'Who paid you back?' : 'Who did you pay back?'}</h2>
        <ul className="split-rows" role="listbox" aria-label="People">
          {eligible.map((p) => (
            <li key={p.contact.id}>
              <button
                type="button"
                role="option"
                aria-selected={contactId === p.contact.id}
                className={`settle-candidate${contactId === p.contact.id ? ' is-selected' : ''}`}
                onClick={() => {
                  setContactId(p.contact.id)
                  setAllocations(null)
                }}
              >
                <PersonInitials name={p.contact.displayName} />
                <span className="settle-candidate-main">
                  <span className="settle-candidate-title">{p.contact.displayName}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {contactId && (
        <section className="wizard-question">
          <h2>What does it pay for?</h2>
          <PaymentAllocation key={contactId} contactId={contactId} name={name} available={main.amount} currencyCode={main.currencyCode} onChange={setAllocations} />
        </section>
      )}
      {error && <Alert variant="error">{error}</Alert>}
    </WizardStep>
  )
}

interface GroupFlowProps {
  /** Offered when this money could pay back what someone owes (or is owed). */
  onPayBack: (() => void) | null
  main: GroupMainTransaction
  group: Group | null
  title: string
  subtitle: string
  steps: WizardStepDef[]
  step: Step
  setStep: (step: Step) => void
  onClose: () => void
}

function GroupFlow({ main, group, title, subtitle, steps, step, setStep, onPayBack, onClose }: GroupFlowProps) {
  const { contacts } = useContacts()
  const { candidates, loading: candidatesLoading } = useGroupCandidates(main.currencyCode, group?.id ?? null)
  const currency = main.currencyCode

  const [own, setOwn] = useState<OwnItem[]>(() =>
    group
      ? group.members
          .filter((m) => m.contactId === null)
          .map((m) => ({ transactionId: m.transactionId, description: m.description, date: m.date, amount: m.amount, transactionAmount: m.transactionAmount }))
      : [{ transactionId: main.id, description: main.description, date: main.date, amount: main.amount, transactionAmount: main.amount }],
  )
  const [people, setPeople] = useState<PersonDraft[]>(() =>
    group
      ? group.shares.map((s) => {
          const fromSplit = group.split?.participants.find((p) => p.contactId === s.contactId)
          return {
            contactId: s.contactId,
            value: String(fromSplit ? fromSplit.value : Math.abs(s.amount)),
            forgiven: s.forgiven,
            payments: group.members
              .filter((m) => m.contactId === s.contactId)
              .map((m) => ({ transactionId: m.transactionId, description: m.description, date: m.date, amount: m.amount })),
          }
        })
      : [],
  )
  const [mode, setMode] = useState<SplitMode>(group ? (group.split?.mode ?? 'amount') : 'equal')
  const [includeMe, setIncludeMe] = useState(group?.split ? group.split.myValue > 0 : main.amount < 0)
  const [adding, setAdding] = useState(false)
  const [payingFor, setPayingFor] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ownTotal = sumOf(own.map((o) => o.amount))
  const result = useMemo(
    () => (people.length ? computeSplit(ownTotal, mode, people.map((p) => Number(p.value) || 0), { myValue: includeMe ? 1 : 0 }) : null),
    [ownTotal, mode, includeMe, people],
  )
  const nameOf = (id: string) => contacts.find((c) => c.id === id)?.displayName ?? '…'
  const usedIds = new Set([...own.map((o) => o.transactionId), ...people.flatMap((p) => p.payments.map((x) => x.transactionId))])
  const pickable: PickableTransaction[] = candidates.filter((c) => !usedIds.has(c.id))

  function change<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value)
      setDirty(true)
    }
  }

  function setSelected(ids: string[]) {
    setPeople((list) => {
      const kept = list.filter((p) => ids.includes(p.contactId))
      const added = ids.filter((id) => !list.some((p) => p.contactId === id)).map((id) => ({ contactId: id, value: '0', payments: [], forgiven: 0 }))
      return [...kept, ...added]
    })
    setDirty(true)
  }

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

  function addOwn(item: PickableTransaction) {
    setOwn((list) => [...list, { transactionId: item.id, description: item.description, date: item.date, amount: item.available, transactionAmount: item.amount }])
    setAdding(false)
    setDirty(true)
  }

  function addPayment(contactId: string, share: number, item: PickableTransaction) {
    setPeople((list) =>
      list.map((p) => {
        if (p.contactId !== contactId) return p
        const left = Math.abs(toCents(shareOutstanding({ amount: share, forgiven: p.forgiven }, sumOf(p.payments.map((x) => x.amount)))))
        const part = Math.min(Math.abs(toCents(item.available)), left || Math.abs(toCents(item.available))) / 100
        return { ...p, payments: [...p.payments, { transactionId: item.id, description: item.description, date: item.date, amount: item.available < 0 ? -part : part }] }
      }),
    )
    setPayingFor(null)
    setDirty(true)
  }

  async function save() {
    if (result?.problem) return
    setSaving(true)
    setError(null)
    const input = {
      label: group?.label ?? null,
      members: [
        ...own.map((o) => ({ transactionId: o.transactionId, contactId: null, amount: o.amount === o.transactionAmount ? null : Math.abs(o.amount) })),
        ...people.flatMap((p) => p.payments.map((x) => ({ transactionId: x.transactionId, contactId: p.contactId, amount: Math.abs(x.amount) }))),
      ],
      split: people.length
        ? { mode, myValue: includeMe ? 1 : 0, participants: people.map((p) => ({ contactId: p.contactId, value: Number(p.value) || 0 })) }
        : null,
    }
    try {
      if (group) await groupsApi.update(group.id, input)
      else await groupsApi.create(input)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t save'))
      setSaving(false)
    }
  }

  const nothingAdded = own.length + people.length < 2
  const withPrimary = people.length
    ? { label: 'Continue', disabled: nothingAdded }
    : { label: group && nothingAdded ? 'Ungroup' : 'Save', disabled: !group && nothingAdded, loading: saving }

  return (
    <WizardModal open title={title} subtitle={subtitle} steps={steps} currentStep={step} stepKey={step} dirty={dirty} onClose={onClose}>
      {step === 'with' && (
        <WizardStep onSubmit={() => (people.length ? setStep('split') : void save())} footer={{ primary: withPrimary }}>
          {onPayBack && (
            <button type="button" className="group-payback" onClick={onPayBack}>
              <PeopleIcon />
              <span className="group-payback-text">
                <span className="group-payback-title">{main.amount > 0 ? 'Someone paying you back?' : 'Paying someone back?'}</span>
                <span className="group-payback-sub">{main.amount > 0 ? 'Match it to what they owe you' : 'Match it to what you owe them'}</span>
              </span>
              <ChevronRightIcon />
            </button>
          )}
          <section className="wizard-question">
            <h2>Who’s in on it?</h2>
            <ContactPicker multiple selectedIds={people.map((p) => p.contactId)} onChange={setSelected} />
          </section>
          <section className="wizard-question">
            <h2>Your transactions</h2>
            <ul className="group-items">
              {own.map((o) => (
                <li key={o.transactionId} className="group-item">
                  <span className="group-item-main">
                    <span className="group-item-title">{o.description || 'Untitled'}</span>
                    <span className="group-item-sub">
                      {formatDate(o.date)}
                      {o.amount !== o.transactionAmount && ` · part of ${formatCurrency(o.transactionAmount, currency)}`}
                    </span>
                  </span>
                  <span className="mono">{formatCurrency(o.amount, currency)}</span>
                  {own.length > 1 && (
                    <button
                      type="button"
                      className="icon-button icon-button--small"
                      aria-label={`Remove ${o.description || 'Untitled'}`}
                      onClick={change(() => setOwn((list) => list.filter((x) => x.transactionId !== o.transactionId)))}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {adding ? (
              <TransactionPicker items={pickable} loading={candidatesLoading} onPick={addOwn} emptyText={`No other transactions in ${currency} to add.`} />
            ) : (
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <PlusIcon /> Add a transaction
              </Button>
            )}
            <p className="wizard-hint">A refund, a card payment, a transfer between your accounts: anything that nets out with it.</p>
          </section>
          {error && <Alert variant="error">{error}</Alert>}
        </WizardStep>
      )}

      {step === 'split' && result && (
        <WizardStep
          onSubmit={() => void save()}
          footer={{ back: { label: 'Back', onClick: () => setStep('with') }, primary: { label: 'Save', disabled: !!result.problem, loading: saving } }}
        >
          <section className="wizard-question">
            <h2>{ownTotal < 0 ? 'How is it split?' : 'Whose money is it?'}</h2>
            <SegmentedControl value={mode} options={MODE_OPTIONS} onChange={changeMode} ariaLabel="How to split" />
            <ul className="split-rows">
              <li className="split-row">
                <span className="person-initials is-me" aria-hidden="true">
                  You
                </span>
                <span className="split-row-name">You</span>
                {mode === 'equal' && (
                  <label className="split-row-include">
                    <input type="checkbox" checked={includeMe} onChange={(e) => change(setIncludeMe)(e.target.checked)} />
                    Include me
                  </label>
                )}
                <span className="split-row-amount mono">{formatCurrency(result.myShare, currency)}</span>
              </li>
              {people.map((p, i) => {
                const share = shareAmount(ownTotal, result.shares[i] ?? 0)
                const paid = sumOf(p.payments.map((x) => x.amount))
                const outstanding = shareOutstanding({ amount: share, forgiven: Math.abs(p.forgiven) <= Math.abs(share) ? p.forgiven : 0 }, paid)
                // A payment has happened: nothing dated in the future.
                const payable = pickable.filter((c) => Math.sign(c.available) === Math.sign(share) && c.date <= today)
                return (
                  <li key={p.contactId} className="split-person">
                    <div className="split-row">
                      <PersonInitials name={nameOf(p.contactId)} />
                      <span className="split-row-name">{nameOf(p.contactId)}</span>
                      {mode !== 'equal' && (
                        <input
                          className="split-row-input"
                          inputMode="decimal"
                          aria-label={`${nameOf(p.contactId)} ${mode === 'amount' ? 'amount' : 'percent'}`}
                          value={p.value}
                          onChange={(e) => {
                            const value = e.target.value
                            setPeople((list) => list.map((d, j) => (j === i ? { ...d, value } : d)))
                            setDirty(true)
                          }}
                        />
                      )}
                      <span className="split-row-amount mono">{formatCurrency(result.shares[i] ?? 0, currency)}</span>
                    </div>
                    <ul className="split-payments">
                      {p.payments.map((x) => (
                        <li key={x.transactionId} className="split-payment is-paid">
                          <span>
                            Paid · {x.description || 'Untitled'} · {formatDate(x.date)}
                          </span>
                          <span className="mono">{formatCurrency(Math.abs(x.amount), currency)}</span>
                          <button
                            type="button"
                            className="icon-button icon-button--small"
                            aria-label={`Remove ${x.description || 'Untitled'} from ${nameOf(p.contactId)}`}
                            onClick={change(() =>
                              setPeople((list) => list.map((d) => (d.contactId === p.contactId ? { ...d, payments: d.payments.filter((y) => y.transactionId !== x.transactionId) } : d))),
                            )}
                          >
                            <CloseIcon />
                          </button>
                        </li>
                      ))}
                      {p.forgiven !== 0 && Math.abs(p.forgiven) <= Math.abs(share) && (
                        <li className="split-payment">
                          <span>Forgiven</span>
                          <span className="mono">{formatCurrency(Math.abs(p.forgiven), currency)}</span>
                        </li>
                      )}
                      {outstanding !== 0 && !result.problem && (
                        <li className="split-payment is-expected">
                          <span>{share > 0 ? 'Expected from them' : 'You’ll pay them'}</span>
                          <span className="mono">{formatCurrency(Math.abs(outstanding), currency)}</span>
                          {Math.sign(outstanding) === Math.sign(share) && payingFor !== p.contactId && (
                            <button type="button" className="text-button" onClick={() => setPayingFor(p.contactId)}>
                              {share > 0 ? 'They paid' : 'You paid'}
                            </button>
                          )}
                        </li>
                      )}
                    </ul>
                    {payingFor === p.contactId && (
                      <div className="split-pay-picker">
                        <TransactionPicker
                          items={payable}
                          loading={candidatesLoading}
                          onPick={(item) => addPayment(p.contactId, share, item)}
                          emptyText={share > 0 ? 'No money received to pick from.' : 'No payments to pick from.'}
                        />
                        <button type="button" className="text-button" onClick={() => setPayingFor(null)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            {result.problem && <Alert variant="error">{PROBLEMS[result.problem]}</Alert>}
          </section>
          {error && <Alert variant="error">{error}</Alert>}
        </WizardStep>
      )}
    </WizardModal>
  )
}
