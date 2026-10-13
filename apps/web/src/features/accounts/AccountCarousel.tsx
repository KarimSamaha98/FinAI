import { useEffect, useRef } from 'react'
import type { AccountSummary } from 'shared-types'
import { cardBackground } from '../../lib/cardBackground'
import { accountTypeLabel } from '../../lib/accountTypes'

interface AccountCarouselProps {
  accounts: AccountSummary[]
  /** Empty means every account is selected. */
  selectedIds: string[]
  onToggle: (id: string) => void
}

export function AccountCarousel({ accounts, selectedIds, onToggle }: AccountCarouselProps) {
  const allSelected = selectedIds.length === 0
  const carouselRef = useRef<HTMLDivElement>(null)
  const previousIdsRef = useRef<string[] | null>(null)

  // Bring the card that just became selected fully into view — the first
  // selected card on arrival (e.g. from Home), or the one just tapped.
  useEffect(() => {
    const previousIds = previousIdsRef.current
    previousIdsRef.current = selectedIds
    const focusId = previousIds === null ? selectedIds[0] : selectedIds.find((id) => !previousIds.includes(id))
    const carousel = carouselRef.current
    const card = focusId ? carousel?.querySelector<HTMLElement>(`[data-account-id="${focusId}"]`) : null
    if (!carousel || !card) return

    const reveal = (behavior: ScrollBehavior) => {
      const carouselBox = carousel.getBoundingClientRect()
      const cardBox = card.getBoundingClientRect()
      const padding = 8
      let delta = 0
      if (cardBox.left < carouselBox.left + padding || cardBox.width > carouselBox.width - padding * 2) {
        delta = cardBox.left - carouselBox.left - padding
      } else if (cardBox.right > carouselBox.right - padding) {
        delta = cardBox.right - carouselBox.right + padding
      }
      if (delta !== 0) carousel.scrollBy({ left: delta, behavior })
    }

    // The card grows once selected, so reveal it now and again when it has finished growing.
    reveal(previousIds === null ? 'auto' : 'smooth')
    const onGrown = (event: TransitionEvent) => {
      if (event.target === card && event.propertyName === 'font-size') reveal('smooth')
    }
    card.addEventListener('transitionend', onGrown)
    return () => card.removeEventListener('transitionend', onGrown)
  }, [selectedIds])

  return (
    <div ref={carouselRef} className={`account-carousel${allSelected ? '' : ' is-narrowed'}`} role="group" aria-label="Accounts">
      {accounts.map((account) => {
        const selected = allSelected || selectedIds.includes(account.id)
        const label = `${account.name} (${accountTypeLabel(account.type)})`
        return (
          <button
            key={account.id}
            data-account-id={account.id}
            type="button"
            className={`account-card account-card--branded${account.cardImageUrl ? ' has-photo' : ''}${selected ? ' account-card--selected' : ''}`}
            style={{ background: cardBackground(account.cardColor) }}
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
    </div>
  )
}
