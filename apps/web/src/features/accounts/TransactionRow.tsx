import type { CSSProperties } from 'react'
import { format, parseISO } from 'date-fns'
import type { Account, Category, DisplayRow, DisplayRowPeople, MonthSplit } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate, formatMonthYear } from '../../lib/formatDate'
import { accountTypeIcon } from '../../lib/accountIcons'
import { CategoryIcon } from '../../components/categoryIcons'
import { AccountIcon, FlagIcon, LinkIcon, PeopleIcon, SplitIcon } from '../../components/icons'

interface TransactionRowProps {
  row: DisplayRow
  categories: Category[]
  accounts: Account[]
  /** Lookup for month-split metadata, used to describe split portions. */
  splitByTransactionId?: Map<string, MonthSplit>
  /** Show the account pill — only worth it when more than one account is in view. */
  showAccount?: boolean
  /** Omit for a display-only row (e.g. the CSV wizard's preview). */
  onClick?: () => void
}

/** 1-based index of a portion's month within its split, e.g. Sep within Sep–Aug = 1. */
function monthIndexIn(portionDate: string, startMonth: string): number {
  const [portionYear, portionMonth] = portionDate.split('-').slice(0, 2).map(Number)
  const [startYear, startMonthNum] = startMonth.split('-').slice(0, 2).map(Number)
  return portionYear * 12 + portionMonth - (startYear * 12 + startMonthNum) + 1
}

function names(people: string[]): string {
  if (people.length <= 2) return people.join(' and ')
  return `${people.slice(0, 2).join(', ')} +${people.length - 2}`
}

/** The subline for a row shared with people, e.g. "With Sam and Priya". */
function peopleMeta(people: DisplayRowPeople, amount: number): string {
  const who = names(people.names)
  if (people.kind === 'settle_up') return `Settled up with ${who}`
  return amount < 0 ? `With ${who}` : `From ${who}`
}

/**
 * One ledger row. Plain rows pass through; month-split portions and
 * reconciliation nets carry a kind badge, a second metadata line, and the
 * category pill keeps its fixed slot on every kind. The account pill appears
 * only when more than one account is in view.
 */
export function TransactionRow({
  row,
  categories,
  accounts,
  splitByTransactionId,
  showAccount = false,
  onClick,
}: TransactionRowProps) {
  const isSplitPortion = row.kind === 'month_split_portion'
  const isGroup = row.kind === 'reconciliation_net'
  const isDerived = isSplitPortion || isGroup
  const split = isSplitPortion ? splitByTransactionId?.get(row.sourceTransactionIds[0]) : undefined

  const account = row.anchorAccountId ? accounts.find((a) => a.id === row.anchorAccountId) : undefined
  const accountName = account?.name ?? 'No account'

  const category = categories.find((c) => c.id === row.categoryId)
  const categoryLabel = category?.name ?? 'Uncategorized'

  // The subline spells out what the status icons mean (touch has no hover).
  const linkedCount = row.sourceTransactionIds.length
  const meta = isSplitPortion
    ? split
      ? `Month ${monthIndexIn(row.date, split.startMonth)} of ${split.numMonths} · from ${formatMonthYear(split.startMonth)}`
      : 'Split across months'
    : isGroup
      ? `Linked · ${linkedCount} ${linkedCount === 1 ? 'transaction' : 'transactions'}`
      : row.people
        ? peopleMeta(row.people, row.amount)
        : null

  // Split portions are virtual rows dated on the 1st of each covered month,
  // so they show a real date like any other row.
  const dateLabel = formatDate(row.date)
  const description = row.description || 'No description'
  // A linked row's subline already says "Linked"; a split's doesn't.
  const kindLabel = isSplitPortion ? 'Split' : null
  const ariaLabel = [row.flagged ? 'Needs attention' : null, dateLabel, description, accountName, categoryLabel, kindLabel, meta, formatCurrency(row.amount, row.currencyCode)]
    .filter(Boolean)
    .join(', ')

  return (
    <li className="txn-item">
      <button
        type="button"
        className={`txn-row${onClick ? '' : ' is-static'}`}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        {/* A small calendar leaf; the full date shows on hover. */}
        <span className="txn-row-date has-tooltip has-tooltip--right" data-tooltip={format(parseISO(row.date), 'MMMM do, yyyy')}>
          <span className="txn-date-month">{format(parseISO(row.date), 'MMM')}</span>
          <span className="txn-date-day">{format(parseISO(row.date), 'd')}</span>
        </span>

        <span className="txn-row-description-cell">
          <span className="txn-row-description">{description}</span>
          {(showAccount || meta) && (
            <span className="txn-row-subline">
              {showAccount && (
                <span
                  className={`txn-chip txn-chip--account${account ? ' is-tinted' : ''}`}
                  // A 25% layer of the account's card colour over the grey chip.
                  style={account ? ({ '--chip-tint': account.cardColor } as CSSProperties) : undefined}
                >
                  <span className="txn-chip-icon" aria-hidden="true">
                    {account ? accountTypeIcon(account.type) : <AccountIcon />}
                  </span>
                  <span className="txn-chip-label">{accountName}</span>
                </span>
              )}
              {meta && (
                <span className="txn-row-meta">
                  {/* Linked / split: the icon leads the text that explains it. */}
                  {isDerived && <span className="txn-row-meta-icon" aria-hidden="true">{isSplitPortion ? <SplitIcon /> : <LinkIcon />}</span>}
                  {!isDerived && row.people && (
                    <span className="txn-row-meta-icon" aria-hidden="true">
                      <PeopleIcon />
                    </span>
                  )}
                  {meta}
                </span>
              )}
            </span>
          )}
        </span>

        <span className="txn-row-chips">
          {/* Flagged to act on later: a bare flag beside the category, like Mail
              on the Mac, so flags line up in one column next to the amounts. */}
          {row.flagged && (
            <span className="txn-row-flag has-tooltip has-tooltip--top" data-tooltip="Needs attention">
              <FlagIcon />
            </span>
          )}
          {/* Icon only; the name shows on hover (the row's aria-label already includes it). */}
          <span className={`txn-category-icon has-tooltip has-tooltip--top-end${row.categoryId ? '' : ' is-empty'}`} data-tooltip={categoryLabel}>
            <CategoryIcon name={category?.icon ?? null} />
          </span>
        </span>

        <span className={`txn-row-amount${row.amount > 0 ? ' is-income' : ''}${row.amount === 0 ? ' is-zero' : ''}`}>
          {formatCurrency(row.amount, row.currencyCode)}
        </span>
      </button>
    </li>
  )
}
