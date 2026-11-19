import type { AccountSummary } from 'shared-types'
import { accountTypeLabel } from '../../lib/accountTypes'
import { cardBackground } from '../../lib/cardBackground'
import { WizardStep, type WizardFooterProps } from '../../components/WizardFooter'

interface ChooseAccountStepProps {
  accounts: AccountSummary[]
  accountIdsWithProfile: Set<string>
  selectedId: string | null
  onSelect: (accountId: string) => void
  back: WizardFooterProps['back']
  onContinue: (accountId: string) => void
}

/** Why an account can't take a CSV right now, or null when it can. */
function unavailableReason(account: AccountSummary, hasProfile: boolean): string | null {
  if (!account.csvImportEnabled) return 'CSV import is off'
  if (!hasProfile) return 'No CSV profile set up yet'
  return null
}

/**
 * The import's first step: which account the transactions go into. Every
 * account is listed; only those with CSV import on and a CSV profile can be
 * picked, the rest say why (and are listed last).
 */
export function ChooseAccountStep({ accounts, accountIdsWithProfile, selectedId, onSelect, back, onContinue }: ChooseAccountStepProps) {
  const rows = accounts.map((account) => ({ account, reason: unavailableReason(account, accountIdsWithProfile.has(account.id)) }))
  const sorted = [...rows.filter((r) => !r.reason), ...rows.filter((r) => r.reason)]
  const anyAvailable = rows.some((r) => !r.reason)
  const canContinue = !!selectedId && rows.some((r) => !r.reason && r.account.id === selectedId)

  return (
    <WizardStep
      onSubmit={() => selectedId && canContinue && onContinue(selectedId)}
      footer={{ back, primary: { label: 'Continue', disabled: !canContinue } }}
    >
      <section className="wizard-question">
        <h2>Which account are you importing into?</h2>
        <p className="wizard-hint">
          {anyAvailable
            ? 'Accounts need a CSV profile before they can import. You set one up once per account, from its Settings.'
            : 'None of your accounts can import yet. Set up a CSV profile from an account’s Settings, then come back here.'}
        </p>

        <div className="account-choices" role="radiogroup" aria-label="Account">
          {sorted.map(({ account, reason }) => {
            const selected = !reason && account.id === selectedId
            return (
              <button
                key={account.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={!!reason}
                className={`account-choice${selected ? ' is-selected' : ''}`}
                onClick={() => onSelect(account.id)}
              >
                <span className="account-choice-card" style={{ background: cardBackground(account.cardColor) }} aria-hidden="true">
                  {account.cardImageUrl ? <img src={account.cardImageUrl} alt="" /> : <span>{accountTypeLabel(account.type).charAt(0)}</span>}
                </span>
                <span className="account-choice-text">
                  <span className="account-choice-name">{account.name}</span>
                  <span className={`account-choice-status${reason ? '' : ' has-profile'}`}>{reason ?? 'CSV profile ready'}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </WizardStep>
  )
}
