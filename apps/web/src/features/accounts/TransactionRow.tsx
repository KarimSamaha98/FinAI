import type { Account, Category, DisplayRow, MonthSplit } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate, formatMonthYear } from '../../lib/formatDate'
import { accountTypeIcon } from '../../lib/accountIcons'
import { CategoryIcon } from '../../components/categoryIcons'
import { AccountIcon, LinkIcon, SplitIcon } from '../../components/icons'

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

  const meta = isSplitPortion
    ? split
      ? `Month ${monthIndexIn(row.date, split.startMonth)} of ${split.numMonths} · from ${formatMonthYear(split.startMonth)}`
      : 'Split across months'
    : null

  // Split portions are virtual rows dated on the 1st of each covered month,
  // so they show a real date like any other row.
  const dateLabel = formatDate(row.date)
  const description = row.description || 'No description'
  const kindLabel = isSplitPortion ? 'Split' : isGroup ? 'Linked' : null
  const ariaLabel = [dateLabel, description, accountName, categoryLabel, kindLabel, meta, formatCurrency(row.amount, row.currencyCode)]
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
        <span className="txn-row-date">{dateLabel}</span>

        <span className="txn-row-description-cell">
          <span className="txn-row-description">{description}</span>
          {(showAccount || meta) && (
            <span className="txn-row-subline">
              {showAccount && (
                <span className="txn-chip txn-chip--account">
                  <span className="txn-chip-icon" aria-hidden="true">
                    {account ? accountTypeIcon(account.type) : <AccountIcon />}
                  </span>
                  <span className="txn-chip-label">{accountName}</span>
                </span>
              )}
              {meta && <span className="txn-row-meta">{meta}</span>}
            </span>
          )}
        </span>

        <span className="txn-row-chips">
          {isDerived && (
            <span className="txn-chip txn-chip--kind">
              <span className="txn-chip-icon" aria-hidden="true">
                {isSplitPortion ? <SplitIcon /> : <LinkIcon />}
              </span>
              <span className="txn-chip-label">{kindLabel}</span>
            </span>
          )}
          {/* Icon only; the name shows on hover (the row's aria-label already includes it). */}
          <span className={`txn-category-icon${row.categoryId ? '' : ' is-empty'}`} data-tooltip={categoryLabel}>
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
