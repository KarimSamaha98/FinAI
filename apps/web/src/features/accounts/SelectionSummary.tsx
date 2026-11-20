import type { AccountSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { useCombinedBalance } from '../../hooks/useCombinedBalance'
import { PrivateAmount } from '../../components/PrivateAmount'
import { PrivacyToggle } from '../../components/PrivacyToggle'

interface SelectionSummaryProps {
  /** The accounts currently selected (every account when allSelected). */
  accounts: AccountSummary[]
  allSelected: boolean
}

/** Shown below the cards when more than one account is in view: their combined total in the home currency. */
export function SelectionSummary({ accounts, allSelected }: SelectionSummaryProps) {
  const { total, homeCurrency } = useCombinedBalance(accounts)

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 'var(--space-4) 0' }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0 }}>{allSelected ? 'All accounts' : `${accounts.length} accounts`}</h2>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {allSelected ? 'Every transaction, across every account.' : accounts.map((a) => a.name).join(' · ')}
        </p>
      </div>
      <div className="balance-line">
        <p className="mono" style={{ margin: 0, fontSize: '2rem', fontWeight: 600 }}>
          <span className="visually-hidden">Combined total </span>
          <PrivateAmount amount={total} currencyCode={homeCurrency} />
        </p>
        <PrivacyToggle />
      </div>
    </Card>
  )
}
