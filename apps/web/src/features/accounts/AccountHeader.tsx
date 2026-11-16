import { Link, useNavigate } from 'react-router-dom'
import type { ImportLocationState } from '../import/ImportWizardPage'
import type { AccountSummary } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

interface AccountHeaderProps {
  account: AccountSummary
  /** Whether the account can already read CSVs; null while unknown (no button flashes in). */
  hasProfile: boolean | null
  /** Present when the account has an active bank sync connection — "Sync bank" lives here, not buried in Settings. */
  syncAction?: { onClick: () => void; disabled?: boolean }
}

export function AccountHeader({ account, hasProfile, syncAction }: AccountHeaderProps) {
  const navigate = useNavigate()
  const setupState: ImportLocationState = { setupAccountId: account.id }

  return (
    <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 style={{ margin: 0 }}>{account.name}</h2>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {accountTypeLabel(account.type)}
          {account.institution ? ` · ${account.institution}` : ''}
        </span>
      </div>
      <p className="mono" style={{ margin: 0, fontSize: '2rem', fontWeight: 600 }}>
        {formatCurrency(account.balance, account.balanceCurrencyCode)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-3)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>Newest transaction: {account.lastTransactionDate ? formatDate(account.lastTransactionDate) : '—'}</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
        {syncAction && (
          <Button variant="primary" onClick={syncAction.onClick} disabled={syncAction.disabled}>
            Sync bank
          </Button>
        )}
        {hasProfile === false && (
          <Button variant="primary" onClick={() => navigate('/import', { state: setupState })}>
            Add CSV profile
          </Button>
        )}
        <Link to={`/accounts/${account.id}/settings`}>
          <Button variant="secondary">Settings</Button>
        </Link>
      </div>
    </Card>
  )
}
