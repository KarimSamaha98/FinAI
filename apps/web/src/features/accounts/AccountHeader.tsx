import { Link } from 'react-router-dom'
import type { AccountSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { accountTypeLabel } from '../../lib/accountTypes'
import { PrivateAmount } from '../../components/PrivateAmount'
import { PrivacyToggle } from '../../components/PrivacyToggle'
import { formatDate } from '../../lib/formatDate'

interface AccountHeaderProps {
  account: AccountSummary
}

export function AccountHeader({ account }: AccountHeaderProps) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{account.name}</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {accountTypeLabel(account.type)}
          {account.institution ? ` · ${account.institution}` : ''}
        </span>
      </div>
      <div className="balance-line">
        <p className="mono" style={{ margin: 0, fontSize: '2rem', fontWeight: 600 }}>
          <PrivateAmount amount={account.balance} currencyCode={account.balanceCurrencyCode} />
        </p>
        <PrivacyToggle />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-3)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>Last transaction updated: {account.lastTransactionUpdatedAt ? formatDate(account.lastTransactionUpdatedAt.slice(0, 10)) : '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
        <Link to={`/accounts/${account.id}/settings`}>
          <Button variant="secondary">Settings</Button>
        </Link>
      </div>
    </Card>
  )
}
