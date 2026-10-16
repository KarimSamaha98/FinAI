import { useState, type ReactNode } from 'react'
import type { Account, Category, DisplayRow, MonthSplit, Transaction } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { cardBackground } from '../../lib/cardBackground'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatDate, formatMonthYear } from '../../lib/formatDate'
import { categoryColor } from '../../lib/categoryColor'
import { ChevronDownIcon, LinkIcon, SplitIcon } from '../../components/icons'

export interface RowAction {
  key: string
  label: string
  icon: ReactNode
  onClick: () => void
}

interface TransactionRowProps {
  row: DisplayRow
  categories: Category[]
  accounts: Account[]
  /** Full transaction pool, used to expand a reconciliation group's members inline. */
  transactions?: Transaction[]
  /** Lookup for month-split metadata, used to describe split portions. */
  splitByTransactionId?: Map<string, MonthSplit>
  /** Omit for a display-only row (e.g. the CSV wizard's preview). */
  onClick?: () => void
  /** Quick row actions revealed on hover/focus (e.g. Split, Link). */
  actions?: RowAction[]
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
export function TransactionRow({
  row,
  categories,
  accounts,
  transactions = [],
  splitByTransactionId,
  onClick,
  actions = [],
}: TransactionRowProps) {
  const [expanded, setExpanded] = useState(false)

  const isSplitPortion = row.kind === 'month_split_portion'
  const isGroup = row.kind === 'reconciliation_net'
  const split = isSplitPortion ? splitByTransactionId?.get(row.sourceTransactionIds[0]) : undefined

  const rowAccounts = row.accountIds.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a)
  const account = rowAccounts[0]
  const accountNames = rowAccounts.map((a) => a.name).join(', ')
  const stackedAccounts = isGroup && rowAccounts.length > 1 ? rowAccounts.slice(0, 3) : account ? [account] : []
  const extraAccounts = isGroup ? Math.max(0, rowAccounts.length - 3) : 0
  const canExpand = isGroup && row.sourceTransactionIds.length > 1

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

  const members = canExpand
    ? row.sourceTransactionIds
        .map((id) => transactions.find((t) => t.id === id))
        .filter((t): t is Transaction => !!t)
    : []

  const content = (
    <>
      <span
        className={`txn-row-card${stackedAccounts.length > 1 ? ' txn-row-card--stack' : ''}`}
        title={accountNames || undefined}
      >
        {stackedAccounts.map((a) => (
          <span
            key={a.id}
            className="txn-row-card-face"
            style={{ background: cardBackground(a.cardColor) }}
          >
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
        {row.monthSplitId && <span className="txn-chip txn-chip--special">Split</span>}
        {row.reconciliationGroupId && <span className="txn-chip txn-chip--special">Group</span>}
        {row.convertedValue == null && (
          <span className="txn-chip txn-chip--special" title="No exchange rate yet — it fills in automatically on your next sign-in.">
            Rate pending
          </span>
        )}
        <span className={`txn-chip txn-chip--category${row.categoryId ? '' : ' is-empty'}`}>
          <span className="txn-chip-dot" style={{ background: categoryDot }} aria-hidden="true" />
          {category}
        </span>
      </span>

      <span className={`txn-row-amount${row.amount > 0 ? ' is-income' : ''}${row.amount === 0 ? ' is-zero' : ''}`}>
        {formatCurrency(row.amount, row.currencyCode)}
      </span>
    </>
  )

  return (
    <li className={`txn-item txn-item--${row.kind.replace('_', '-')}`}>
      <button type="button" className={`txn-row${onClick ? '' : ' is-static'}`} aria-label={ariaLabel} onClick={onClick}>
        {content}
      </button>

      {(actions.length > 0 || canExpand) && (
        <div className="txn-row-actions">
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className="txn-row-action"
              aria-label={action.label}
              title={action.label}
              onClick={action.onClick}
            >
              {action.icon}
            </button>
          ))}
          {canExpand && (
            <button
              type="button"
              className="txn-row-action txn-row-expand"
              aria-expanded={expanded}
              aria-label={expanded ? 'Collapse linked transactions' : 'Expand linked transactions'}
              title={expanded ? 'Collapse linked transactions' : 'Expand linked transactions'}
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronDownIcon />
            </button>
          )}
        </div>
      )}

      {expanded && members.length > 0 && (
        <ul className="txn-members">
          {members.map((member) => (
            <li key={member.id} className="txn-member">
              <span className="txn-member-date">{formatDate(member.date)}</span>
              <span className="txn-member-desc">{member.description || 'No description'}</span>
              <span className="txn-member-account">
                {accounts.find((a) => a.id === member.accountId)?.name ?? 'No account'}
              </span>
              <span className={`txn-member-amount${member.amount > 0 ? ' is-income' : ''}`}>
                {formatCurrency(member.amount, member.currencyCode)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
