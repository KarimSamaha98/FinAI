import { useState } from 'react'
import type { AccountSummary, CreateAccountInput } from 'shared-types'
import { WizardModal } from '../../components/WizardModal'
import { WizardResult } from '../../components/WizardResult'
import { AccountCreateStep } from './AccountSteps'
import { ACCOUNT_STEPS, useAccountCreateSteps, useAccountDraft } from './accountDraft'

interface AccountWizardProps {
  open: boolean
  onClose: () => void
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>
  uploadCardImage: (accountId: string, file: File) => Promise<void>
  /** Pre-selected card colour — the next one in the palette. */
  defaultCardColor: string
  /** The account exists (the wizard stays open on its result screen). */
  onCreated: (accountId: string) => void
  /** Next step for an account that can export CSV: start "Set up CSV profile". */
  onSetupCsv: (accountId: string) => void
  /** Next step for an account that can't: start Add a transaction for it. */
  onAddTransaction: (accountId: string) => void
}

const CREATED_STEP = { key: 'created', label: 'Created' }

/**
 * Add account: details → balance → card → CSV import → created. The result
 * screen offers the natural next thing as a separate wizard: setting up CSV
 * import, or adding a transaction by hand when the account has no CSV export.
 */
export function AccountWizard({ open, onClose, createAccount, uploadCardImage, defaultCardColor, onCreated, onSetupCsv, onAddTransaction }: AccountWizardProps) {
  const draft = useAccountDraft({ defaultCardColor })
  const [created, setCreated] = useState<AccountSummary | null>(null)
  const steps = useAccountCreateSteps(draft, createAccount, uploadCardImage, (account) => {
    setCreated(account)
    onCreated(account.id)
  })

  return (
    <WizardModal
      open={open}
      onClose={onClose}
      title="Add account"
      steps={[...ACCOUNT_STEPS, CREATED_STEP]}
      currentStep={created ? CREATED_STEP.key : steps.step}
      dirty={!created && draft.dirty}
    >
      {!created ? (
        <AccountCreateStep
          draft={draft}
          step={steps.step}
          back={steps.isFirst ? undefined : { label: 'Back', onClick: steps.previous }}
          onNext={steps.next}
          creating={steps.creating}
          error={steps.error}
        />
      ) : (
        <WizardResult
          title={`${created.name} is ready`}
          message={
            created.csvImportEnabled
              ? 'Next, set up CSV import: a sample export of this account and a few questions, once per account. Then you can import its history.'
              : 'Its transactions are added by hand. Add the first one now, or any time from the Transactions page.'
          }
          onDone={onClose}
          next={
            created.csvImportEnabled
              ? { label: 'Set up CSV import', onClick: () => onSetupCsv(created.id) }
              : { label: 'Add a transaction', onClick: () => onAddTransaction(created.id) }
          }
        />
      )}
    </WizardModal>
  )
}
