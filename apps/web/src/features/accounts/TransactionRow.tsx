import type { Account, Category, DisplayRow } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { cardBackground } from '../../lib/cardBackground'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatDate } from '../../lib/formatDate'

interface TransactionRowProps {
  row: DisplayRow
  categories: Category[]
  accounts: Account[]
  /** Omit for a display-only row (e.g. the CSV wizard's preview). */
  onClick?: () => void
}

function categoryName(categories: Category[], categoryId: string | null): string {
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

/**
 * One ledger row, per the "Licence Plates" Figma (node 133:478): the account's
 * card thumbnail, date, description, grey chips only for special handling
 * (month split, reconciliation group), the category chip, and the amount.
 */
export function TransactionRow({ row, categories, accounts, onClick }: TransactionRowProps) {
  const isIncome = row.amount >= 0
  const category = categoryName(categories, row.categoryId)
  // A reconciliation net row can span accounts; its first (anchor) account represents it.
  const rowAccounts = row.accountIds.map((id) => accounts.find((a) => a.id === id)).filter((a): a is Account => !!a)
  const account = rowAccounts[0]
  const accountNames = rowAccounts.map((a) => a.name).join(', ')

  const content = (
    <>
      <span
        className="txn-row-card"
        style={account ? { background: cardBackground(account.cardColor) } : undefined}
        title={accountNames || undefined}
      >
        {account?.cardImageUrl ? (
          <img src={account.cardImageUrl} alt="" />
        ) : (
          // No photo: the account type's initial, e.g. C for Cash, I for Investment.
          account && (
            <span className="txn-row-card-initial" aria-hidden="true">
              {accountTypeLabel(account.type).charAt(0)}
            </span>
          )
        )}
        {accountNames && <span className="visually-hidden">{accountNames}</span>}
      </span>
      <span className="txn-row-date">{formatDate(row.date)}</span>
      <span className="txn-row-description">{row.description || 'Untitled'}</span>
      <span className="txn-row-chips">
        {row.monthSplitId && <span className="txn-chip txn-chip--special">Split</span>}
        {row.reconciliationGroupId && <span className="txn-chip txn-chip--special">Group</span>}
        <span className={`txn-chip txn-chip--category${row.categoryId ? '' : ' is-empty'}`}>{category}</span>
      </span>
      <span className={`txn-row-amount${isIncome ? ' is-income' : ''}`}>{formatCurrency(row.amount, row.currencyCode)}</span>
    </>
  )

  return (
    <li>
      {onClick ? (
        <button type="button" className="txn-row" onClick={onClick}>
          {content}
        </button>
      ) : (
        <div className="txn-row is-static">{content}</div>
      )}
    </li>
  )
}
