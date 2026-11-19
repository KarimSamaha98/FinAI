import { useState } from 'react'
import type { AccountSummary, Category, CreateTransactionInput } from 'shared-types'
import { WizardModal } from '../../components/WizardModal'
import { WizardFooter, WizardStep } from '../../components/WizardFooter'
import { ChoiceCard } from '../../components/ChoiceCard'
import { PencilLineIcon, UploadIcon } from '../../components/icons'
import { useImportFlow } from '../import/useImportFlow'
import { TransactionForm } from './TransactionForm'

interface AddTransactionWizardProps {
  open: boolean
  onClose: () => void
  categories: Category[]
  accounts: AccountSummary[]
  /** The one account selected on the Transaction page, if any: fixes the manual form and pre-selects the import's account. */
  fixedAccountId: string | null
  onCreate: (input: CreateTransactionInput) => Promise<void>
  onImported: (accountId: string) => void
  /** Skip the entry animation when taking over from another wizard. */
  animateIn?: boolean
}

type Stage = 'chooser' | 'manual' | 'import'

/**
 * "+ Add Transaction": a chooser (not a step, so no progress bar), then
 * either the manual form or the import wizard, each with a fixed shape.
 * Back on either's first screen returns to the chooser. An account with
 * CSV import off skips the chooser and opens on the form.
 */
export function AddTransactionWizard({ open, onClose, categories, accounts, fixedAccountId, onCreate, onImported, animateIn }: AddTransactionWizardProps) {
  const fixedAccount = fixedAccountId ? (accounts.find((account) => account.id === fixedAccountId) ?? null) : null
  const manualOnly = !!fixedAccount && !fixedAccount.csvImportEnabled

  const [stage, setStage] = useState<Stage>(manualOnly ? 'manual' : 'chooser')
  const [formDirty, setFormDirty] = useState(false)
  const importFlow = useImportFlow({ onExit: () => setStage('chooser'), onImported })

  function startImport() {
    importFlow.start({ mode: 'pick', preselectAccountId: fixedAccountId })
    setStage('import')
  }

  if (stage === 'import' && importFlow.view) {
    const view = importFlow.view
    return (
      <WizardModal
        open={open}
        onClose={onClose}
        title={view.title}
        subtitle={view.subtitle}
        steps={view.steps}
        currentStep={view.currentStep}
        size="lg"
        dirty={view.dirty}
        animateIn={animateIn}
      >
        {view.body}
      </WizardModal>
    )
  }

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title={stage === 'manual' ? 'Add a transaction' : 'Add transactions'}
      subtitle={fixedAccount?.name}
      // Neither the chooser nor the one-screen manual form is a multi-step wizard.
      steps={[]}
      // The chooser is a small menu, not a wizard frame.
      size={stage === 'chooser' ? 'sm' : 'md'}
      currentStep={stage}
      dirty={stage === 'manual' && formDirty}
      animateIn={animateIn}
    >
      {stage === 'chooser' && (
        <WizardStep footer={{}}>
          <section className="wizard-question">
            <h2>How do you want to add them?</h2>
            <div className="wizard-choices wizard-choices--stacked">
              <ChoiceCard
                icon={<UploadIcon />}
                title="Import a CSV"
                detail="Add many transactions at once from a CSV export"
                selected={false}
                onSelect={startImport}
              />
              <ChoiceCard
                icon={<PencilLineIcon />}
                title="Enter manually"
                detail="Type in a single transaction, like a cash purchase"
                selected={false}
                onSelect={() => setStage('manual')}
              />
            </div>
          </section>
        </WizardStep>
      )}

      {stage === 'manual' && (
        <TransactionForm
          categories={categories}
          accounts={accounts}
          fixedAccountId={fixedAccountId}
          onSubmit={onCreate}
          onCancel={onClose}
          onDirtyChange={setFormDirty}
          renderActions={({ submitting }) => (
            <WizardFooter
              back={manualOnly ? undefined : { label: 'Back', onClick: () => setStage('chooser') }}
              primary={{ label: 'Save transaction', loading: submitting }}
            />
          )}
        />
      )}
    </WizardModal>
  )
}
