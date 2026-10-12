import type { AccountSummary } from 'shared-types'
import { Button } from '../../components/Button'
import { accountTypeLabel } from '../../lib/accountTypes'
import { cardBackground } from '../../lib/cardBackground'

interface ChooseAccountStepProps {
  fileName: string
  accounts: AccountSummary[]
  accountIdsWithProfile: Set<string>
  selectedId: string | null
  onSelect: (accountId: string) => void
  onBack: () => void
  onContinue: (accountId: string) => void
}

/** "Which account is this CSV for?" — each account as a tile with its card and whether it can already read CSVs. */
export function ChooseAccountStep({ fileName, accounts, accountIdsWithProfile, selectedId, onSelect, onBack, onContinue }: ChooseAccountStepProps) {
  return (
    <section className="wizard-question">
      <p className="wizard-hint">
        Uploaded <strong>{fileName}</strong>. Pick the account these transactions belong to.
      </p>

      <div className="account-choices" role="radiogroup" aria-label="Account">
        {accounts.map((account) => {
          const selected = account.id === selectedId
          const hasProfile = accountIdsWithProfile.has(account.id)
          return (
            <button
              key={account.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`account-choice${selected ? ' is-selected' : ''}`}
              onClick={() => onSelect(account.id)}
            >
              <span className="account-choice-card" style={{ background: cardBackground(account.cardColor) }} aria-hidden="true">
                {account.cardImageUrl ? <img src={account.cardImageUrl} alt="" /> : <span>{accountTypeLabel(account.type).charAt(0)}</span>}
              </span>
              <span className="account-choice-text">
                <span className="account-choice-name">{account.name}</span>
                <span className={`account-choice-status${hasProfile ? ' has-profile' : ''}`}>
                  {hasProfile ? 'CSV profile ready' : 'No CSV profile yet'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      <div className="wizard-nav">
        <Button variant="secondary" onClick={onBack}>
          Upload a different file
        </Button>
        <Button variant="primary" disabled={!selectedId} onClick={() => selectedId && onContinue(selectedId)}>
          Continue
        </Button>
      </div>
    </section>
  )
}
