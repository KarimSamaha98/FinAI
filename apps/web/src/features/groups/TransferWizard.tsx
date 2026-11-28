import { useState } from 'react'
import type { Account } from 'shared-types'
import { WizardModal } from '../../components/WizardModal'
import { WizardStep } from '../../components/WizardFooter'
import { Alert } from '../../components/Alert'
import { formatCurrency } from '../../lib/formatCurrency'
import { groupsApi, useTransferCandidates } from '../../hooks/useGroups'
import { apiErrorMessage } from '../../hooks/usePeople'
import { TransactionPicker, type PickableTransaction } from './TransactionPicker'
import { TransferSummary } from './TransferSummary'

/** The transaction the Match transfer action was used on. */
export interface TransferSource {
  id: string
  date: string
  description: string
  amount: number
  currencyCode: string
  accountId: string | null
}

interface TransferWizardProps {
  transaction: TransferSource
  accounts: Account[]
  onClose: () => void
}

/**
 * Money moving between the user's own accounts (to savings, paying off a
 * card): pick the other side, in another account and any currency. Likely
 * matches (same amount, a few days apart) come first. Once matched, the two
 * cancel out in the real view, leaving only an FX difference or a fee.
 */
export function TransferWizard({ transaction, accounts, onClose }: TransferWizardProps) {
  const { candidates, loading, error: loadError } = useTransferCandidates(transaction.id)
  const [picked, setPicked] = useState<PickableTransaction | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const out = transaction.amount < 0
  const pickedCandidate = picked ? candidates.find((c) => c.id === picked.id) : undefined

  async function save() {
    if (!picked) return
    setSaving(true)
    setError(null)
    try {
      await groupsApi.createTransfer({ transactionIds: [transaction.id, picked.id] })
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t match the transfer'))
      setSaving(false)
    }
  }

  const sides = pickedCandidate ? (out ? [transaction, pickedCandidate] : [pickedCandidate, transaction]) : null

  return (
    <WizardModal
      open
      title="Match transfer"
      subtitle={`${transaction.description || 'Untitled'} · ${formatCurrency(transaction.amount, transaction.currencyCode)}`}
      steps={[{ key: 'other', label: 'Other side' }]}
      currentStep="other"
      dirty={picked !== null}
      onClose={onClose}
    >
      <WizardStep onSubmit={() => void save()} footer={{ primary: { label: 'Match', disabled: !picked, loading: saving } }}>
        <section className="wizard-question">
          <h2>{out ? 'Where did it go?' : 'Where did it come from?'}</h2>
          <p className="wizard-hint">
            {out ? 'Money coming into another of your accounts' : 'Money going out of another of your accounts'}, in any currency. A likely match is the same amount within a week.
          </p>
          {loadError ? (
            <Alert variant="error">{loadError}</Alert>
          ) : sides ? (
            <>
              <TransferSummary from={sides[0]} to={sides[1]} accounts={accounts} />
              <button type="button" className="text-button transfer-change" onClick={() => setPicked(null)}>
                Choose a different one
              </button>
            </>
          ) : (
            <TransactionPicker
              items={candidates}
              loading={loading}
              selectedId={picked?.id ?? null}
              onPick={setPicked}
              emptyText="Nothing in your other accounts could be the other side. Add it to that account first, then match it here."
            />
          )}
        </section>
        {error && <Alert variant="error">{error}</Alert>}
      </WizardStep>
    </WizardModal>
  )
}
