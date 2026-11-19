import type { AccountType } from 'shared-types'
import { ACCOUNT_TYPE_OPTIONS } from '../../lib/accountTypes'
import { ChoiceCard } from '../../components/ChoiceCard'
import { Alert } from '../../components/Alert'
import { WizardStep, type WizardFooterProps } from '../../components/WizardFooter'
import { FieldSelect } from '../../components/FieldSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { useCurrencies } from '../../hooks/useCurrencies'
import { CardAppearanceEditor } from './CardAppearanceEditor'
import { ACCOUNT_STEPS, ACCOUNT_STEP_QUESTIONS, type AccountDraft, type AccountStepKey } from './accountDraft'

/** The Add account step bodies. */
export function AccountDetailsFields({ draft }: { draft: AccountDraft }) {
  return (
    <>
      <label>
        Name
        <input type="text" value={draft.name} onChange={(e) => draft.setName(e.target.value)} placeholder="e.g. CIBC Costco" required data-autofocus />
      </label>
      <label>
        Type
        <FieldSelect<AccountType> value={draft.type} options={ACCOUNT_TYPE_OPTIONS} onChange={draft.setType} />
      </label>
      <label>
        Institution (optional)
        <input type="text" value={draft.institution} onChange={(e) => draft.setInstitution(e.target.value)} placeholder="e.g. CIBC" />
      </label>
    </>
  )
}

export function AccountBalanceFields({ draft }: { draft: AccountDraft }) {
  const { options: currencyOptions } = useCurrencies()
  return (
    <>
      <label>
        Currency
        <FieldSelect value={draft.currencyCode} options={currencyOptions} onChange={draft.setCurrencyCode} />
      </label>
      <div className="wizard-field-row">
        <label className="wizard-inline-field">
          {draft.type === 'cash' ? 'Cash on hand' : 'Current balance'}
          <input
            type="number"
            step="0.01"
            required
            value={draft.startingBalance}
            onChange={(e) => draft.setStartingBalance(e.target.value)}
            data-autofocus
          />
        </label>
        <label className="wizard-inline-field">
          As of
          <FieldDatePicker required value={draft.balanceAsOf} onChange={draft.setBalanceAsOf} />
        </label>
      </div>
      <p className="wizard-hint">
        {draft.type === 'cash'
          ? 'Transactions you add after this date update the balance from here.'
          : 'Transactions dated after this day update the balance. Older ones you import later are kept as history and don’t count twice.'}
      </p>
    </>
  )
}

export function AccountCardFields({ draft, busy }: { draft: AccountDraft; busy?: boolean }) {
  return (
    <CardAppearanceEditor
      name={draft.name}
      color={draft.cardColor}
      photoUrl={draft.cardPhotoUrl}
      busy={busy}
      onColorChange={draft.setCardColor}
      onPhotoSelected={draft.selectPhoto}
      onRemovePhoto={draft.removePhoto}
    />
  )
}


const LAST_STEP = ACCOUNT_STEPS[ACCOUNT_STEPS.length - 1].key

/** "Can you download this account’s transactions as a CSV?" Stored as csvImportEnabled. */
export function AccountCsvFields({ draft }: { draft: AccountDraft }) {
  return (
    <div className="wizard-choices">
      <ChoiceCard
        title="Yes"
        detail="Its website or app lets me export transactions as a CSV file"
        selected={draft.csvImportEnabled}
        onSelect={() => draft.setCsvImportEnabled(true)}
      />
      <ChoiceCard
        title="No"
        detail="I’ll add its transactions by hand (e.g. cash)"
        selected={!draft.csvImportEnabled}
        onSelect={() => draft.setCsvImportEnabled(false)}
      />
    </div>
  )
}

interface AccountCreateStepProps {
  draft: AccountDraft
  step: AccountStepKey
  back: WizardFooterProps['back']
  /** Continue to the next step, or create the account on the last one. */
  onNext: () => void
  creating: boolean
  error: string | null
}

/** One new-account step framed as a wizard step: the question, its fields, and Continue / Create account. */
export function AccountCreateStep({ draft, step, back, onNext, creating, error }: AccountCreateStepProps) {
  const question = ACCOUNT_STEP_QUESTIONS[step]
  return (
    <WizardStep
      onSubmit={onNext}
      footer={{
        back,
        primary: { label: step === LAST_STEP ? 'Create account' : 'Continue', disabled: !draft.valid[step], loading: creating },
      }}
    >
      <section className="wizard-question">
        <h2>{question.title}</h2>
        {question.hint && <p className="wizard-hint">{question.hint}</p>}
        <div className="wizard-fields">
          {step === 'details' && <AccountDetailsFields draft={draft} />}
          {step === 'balance' && <AccountBalanceFields draft={draft} />}
          {step === 'card' && <AccountCardFields draft={draft} busy={creating} />}
          {step === 'csv' && <AccountCsvFields draft={draft} />}
        </div>
      </section>
      {step === 'card' && draft.photoError && <Alert variant="error">{draft.photoError}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
    </WizardStep>
  )
}

