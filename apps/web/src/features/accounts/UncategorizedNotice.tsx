import { ChevronRightIcon, InfoIcon } from '../../components/icons'

interface UncategorizedNoticeProps {
  count: number
  onOpen: () => void
}

/** "You have N uncategorized transactions" — tapping it opens the categorize deck. Hidden at zero. */
export function UncategorizedNotice({ count, onOpen }: UncategorizedNoticeProps) {
  if (count === 0) return null
  return (
    <button type="button" className="notice-box" onClick={onOpen}>
      <span className="notice-box-icon">
        <InfoIcon />
      </span>
      <span className="notice-box-text">
        <strong>
          You have {count} uncategorized {count === 1 ? 'transaction' : 'transactions'}
        </strong>
        <span>Tap to categorize {count === 1 ? 'it' : 'them'}</span>
      </span>
      <span className="notice-box-chevron">
        <ChevronRightIcon />
      </span>
    </button>
  )
}
