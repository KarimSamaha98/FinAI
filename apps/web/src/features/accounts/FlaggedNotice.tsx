import { ChevronRightIcon, FlagIcon } from '../../components/icons'

interface FlaggedNoticeProps {
  count: number
  /** Shows only the flagged transactions. */
  onOpen: () => void
}

/** "3 transactions need attention" — tapping it filters the list to them. Hidden at zero. */
export function FlaggedNotice({ count, onOpen }: FlaggedNoticeProps) {
  if (count === 0) return null
  return (
    <button type="button" className="notice-box notice-box--flagged" onClick={onOpen}>
      <span className="notice-box-icon">
        <FlagIcon />
      </span>
      <span className="notice-box-text">
        <strong>
          {count} {count === 1 ? 'transaction needs' : 'transactions need'} attention
        </strong>
        <span>Tap to see {count === 1 ? 'it' : 'them'}</span>
      </span>
      <span className="notice-box-chevron">
        <ChevronRightIcon />
      </span>
    </button>
  )
}
