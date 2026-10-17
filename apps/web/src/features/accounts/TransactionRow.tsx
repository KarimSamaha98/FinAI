import type { Account, Category, DisplayRow, MonthSplit } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { cardBackground } from '../../lib/cardBackground'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatDate, formatMonthYear } from '../../lib/formatDate'
import { categoryColor } from '../../lib/categoryColor'
import { LinkIcon, SplitIcon } from '../../components/icons'

interface TransactionRowProps {
  row: DisplayRow
  categories: Category[]
  accounts: Account[]
  /** Lookup for month-split metadata, used to describe split portions. */
  splitByTransactionId?: Map<string, MonthSplit>
  /** Omit for a display-only row (e.g. the CSV wizard's preview). */
  onClick?: () => void
}

function categoryName(categories: Category[], categoryId: string | null): string {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

/** 1-based index of a portion's month within its split, e.g. Sep within Sep–Aug = 1. */
function monthIndexIn(portionDate: string, startMonth: string): number {
  const [portionYear, portionMonth] = portionDate.split('-').slice(0, 2).map(Number)
  const [startYear, startMonthNum] = startMonth.split('-').slice(0, 2).map(Number)
  return portionYear * 12 + portionMonth - (startYear * 12 + startMonthNum) + 1
}

function AccountTile({ account }: { account: Account }) {
  return account.cardImageUrl ? (
    <img src={account.cardImageUrl} alt="" width={40} height={25} loading="lazy" />
  ) : (
    <span className="txn-row-card-initial" aria-hidden="true">
      {accountTypeLabel(account.type).charAt(0)}
    </span>
  )
}

/**
 * One ledger row. Plain rows pass through; month-split portions and
 * reconciliation nets carry a corner badge on the account tile and a second
 * metadata line, while the category pill keeps its fixed slot on every kind.
 */
export function TransactionRow({ row, categories, accounts, splitByTransactionId, onClick }: TransactionRowProps) {
  const isSplitPortion = row.kind === 'month_split_portion'
  const isGroup = row.kind === 'reconciliation_net'
  const split = isSplitPortion ? splitByTransactionId?.get(row.sourceTransactionIds[0]) : undefined

  const rowAccounts = row.accountIds.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a)
  const account = rowAccounts[0]
  const accountNames = rowAccounts.map((a) => a.name).join(', ')
  const stackedAccounts = isGroup && rowAccounts.length > 1 ? rowAccounts.slice(0, 3) : account ? [account] : []
  const extraAccounts = isGroup ? Math.max(0, rowAccounts.length - 3) : 0

  const category = categoryName(categories, row.categoryId)
  const categoryDot = categoryColor(row.categoryId, categories) ?? 'var(--text-muted)'

  const meta = isSplitPortion
    ? split
      ? `Month ${monthIndexIn(row.date, split.startMonth)} of ${split.numMonths} · from ${formatMonthYear(split.startMonth)}`
      : 'Split across months'
    : isGroup
      ? `Net of ${row.sourceTransactionIds.length} linked transactions`
      : null

  const dateLabel = isSplitPortion ? formatMonthYear(row.date) : formatDate(row.date)
  const description = row.description || 'No description'
  const ariaLabel = [dateLabel, description, accountNames, category, meta, formatCurrency(row.amount, row.currencyCode)]
    .filter(Boolean)
    .join(', ')

  return (
  return (
    <li className="txn-item">
      <button
        type="button"
        className={`txn-row${onClick ? '' : ' is-static'}`}
        aria-label={ariaLabel}
        onClick={onClick}
      >
        <span
          className={`txn-row-card${stackedAccounts.length > 1 ? ' txn-row-card--stack' : ''}`}
          title={accountNames || undefined}
        >
          {stackedAccounts.map((a) => (
            <span key={a.id} className="txn-row-card-face" style={{ background: cardBackground(a.cardColor) }}>
              <AccountTile account={a} />
            </span>
          ))}
          {stackedAccounts.length === 0 && (
            <span className="txn-row-card-face txn-row-card-face--empty" aria-hidden="true">
              <span className="txn-row-card-initial">–</span>
            </span>
          )}
          {extraAccounts > 0 && <span className="txn-row-card-plus">+{extraAccounts}</span>}
          {(isSplitPortion || isGroup) && (
            <span className="txn-row-card-kind" aria-hidden="true">
              {isSplitPortion ? <SplitIcon /> : <LinkIcon />}
            </span>
          )}
        </span>

        <span className="txn-row-date">{dateLabel}</span>

        <span className="txn-row-description-cell">
          <span className="txn-row-description">{description}</span>
          {meta && <span className="txn-row-meta">{meta}</span>}
        </span>

        <span className="txn-row-chips">
          <span className={`txn-chip txn-chip--category${row.categoryId ? '' : ' is-empty'}`}>
            <span className="txn-chip-dot" style={{ background: categoryDot }} aria-hidden="true" />
            {category}
          </span>
        </span>

        <span className={`txn-row-amount${row.amount > 0 ? ' is-income' : ''}${row.amount === 0 ? ' is-zero' : ''}`}>
          {formatCurrency(row.amount, row.currencyCode)}
        </span>
      </button>
    </li>
  )
}
