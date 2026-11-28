import type { Account } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface Side {
  date: string
  description: string
  amount: number
  currencyCode: string
  accountId: string | null
}

interface TransferSummaryProps {
  /** The money going out. */
  from: Side
  /** The money coming in. */
  to: Side
  accounts: Account[]
}

/**
 * A transfer's two sides, "Chequing → Visa", and what doesn't cancel out:
 * the rate when the currencies differ, or the difference (a fee, say) when
 * the amounts do.
 */
export function TransferSummary({ from, to, accounts }: TransferSummaryProps) {
  const accountName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'Another account'
  const sent = Math.abs(from.amount)
  const received = Math.abs(to.amount)
  const sameCurrency = from.currencyCode === to.currencyCode
  const difference = sameCurrency ? Math.round((received - sent) * 100) / 100 : 0

  return (
    <div className="transfer-summary">
      <div className="transfer-side">
        <span className="transfer-side-label">From {accountName(from.accountId)}</span>
        <span className="transfer-side-sub">
          {from.description || 'Untitled'} · {formatDate(from.date)}
        </span>
        <span className="mono">{formatCurrency(-sent, from.currencyCode)}</span>
      </div>
      <span className="transfer-arrow" aria-hidden="true">
        →
      </span>
      <div className="transfer-side">
        <span className="transfer-side-label">To {accountName(to.accountId)}</span>
        <span className="transfer-side-sub">
          {to.description || 'Untitled'} · {formatDate(to.date)}
        </span>
        <span className="mono">{formatCurrency(received, to.currencyCode)}</span>
      </div>
      {!sameCurrency && sent > 0 && (
        <p className="transfer-note">
          1 {from.currencyCode} = {(received / sent).toFixed(4)} {to.currencyCode}. Any FX gain or loss shows in your spending.
        </p>
      )}
      {difference !== 0 && (
        <p className="transfer-note">
          {difference < 0
            ? `${formatCurrency(-difference, from.currencyCode)} didn’t arrive (a fee, say): it stays in your spending.`
            : `${formatCurrency(difference, from.currencyCode)} more arrived than left: it stays as income.`}
        </p>
      )}
    </div>
  )
}
