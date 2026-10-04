import type { AccountSummary } from 'shared-types'
import { accountTypeLabel } from '../../lib/accountTypes'

/**
 * Selection is a set of account ids, where the empty set means "every
 * account". From "every account", tapping a card narrows to just that card;
 * after that taps toggle cards in and out, and the selection falls back to
 * "every account" when it would become empty or would cover every card.
 */
export function nextAccountSelection(selectedIds: string[], clickedId: string, allIds: string[]): string[] {
  if (selectedIds.length === 0) return [clickedId]
  const next = selectedIds.includes(clickedId) ? selectedIds.filter((id) => id !== clickedId) : [...selectedIds, clickedId]
  return next.length === 0 || allIds.every((id) => next.includes(id)) ? [] : next
}

interface AccountCarouselProps {
  accounts: AccountSummary[]
  /** Empty means every account is selected. */
  selectedIds: string[]
  onToggle: (id: string) => void
  onAddClick: () => void
}

export function AccountCarousel({ accounts, selectedIds, onToggle, onAddClick }: AccountCarouselProps) {
  const allSelected = selectedIds.length === 0

  return (
    <div className="account-carousel" role="group" aria-label="Accounts">
      {accounts.map((account) => {
        const selected = allSelected || selectedIds.includes(account.id)
        const label = `${account.name} (${accountTypeLabel(account.type)})`
        return (
          <button
            key={account.id}
            type="button"
            className={`account-card account-card--branded${account.cardImageUrl ? ' has-photo' : ''}${selected ? ' account-card--selected' : ''}`}
            style={{ background: account.cardColor }}
            aria-pressed={selected}
            aria-label={account.cardImageUrl ? label : undefined}
            title={account.cardImageUrl ? label : undefined}
            onClick={() => onToggle(account.id)}
          >
            {account.cardImageUrl ? (
              // A photo stands on its own — no labels on top of it.
              <img src={account.cardImageUrl} alt="" className="account-card-photo" />
            ) : (
              <>
                <span className="account-card-type">{accountTypeLabel(account.type)}</span>
                <span className="account-card-name">{account.name}</span>
              </>
            )}
          </button>
        )
      })}
      <button type="button" className="account-card account-card--add" onClick={onAddClick}>
        + Add account
      </button>
    </div>
  )
}
