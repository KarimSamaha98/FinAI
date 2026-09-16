import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { AccountSummary, UpdateAccountInput } from 'shared-types'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { accountTypeLabel } from '../../lib/accountTypes'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { UpdateBalanceModal } from './UpdateBalanceModal'

interface AccountHeaderProps {
  account: AccountSummary
  hasProfile: boolean
  onAddTransaction: () => void
  updateAccount: (id: string, input: Omit<UpdateAccountInput, 'id'>) => Promise<void>
}

export function AccountHeader({ account, hasProfile, onAddTransaction, updateAccount }: AccountHeaderProps) {
  const navigate = useNavigate()
  const [showUpdateBalance, setShowUpdateBalance] = useState(false)

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
        {formatCurrency(account.balance, account.currencyCode)}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1) var(--space-3)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <span>Last transaction: {account.lastTransactionDate ? formatDate(account.lastTransactionDate) : '—'}</span>
        <span>Last transaction updated: {account.lastTransactionUpdatedAt ? formatDate(account.lastTransactionUpdatedAt.slice(0, 10)) : '—'}</span>
        <span>Last balance updated: {formatDate(account.lastBalanceUpdatedAt.slice(0, 10))}</span>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
        <Button variant="primary" onClick={onAddTransaction}>
          + Add Transaction
        </Button>
        <Button
          variant="secondary"
          title={hasProfile ? undefined : 'This account has no import profile yet — set one up first'}
          onClick={() => navigate(`/accounts/${account.id}/import`)}
        >
          {hasProfile ? 'Import Transaction CSV' : 'Set up CSV import'}
        </Button>
        <Button variant="secondary" onClick={() => setShowUpdateBalance(true)}>
          Update Balance
        </Button>
        <Link to={`/accounts/${account.id}/settings`}>
          <Button variant="secondary">Settings</Button>
        </Link>
      </div>

      {showUpdateBalance && (
        <UpdateBalanceModal
          open={showUpdateBalance}
          onClose={() => setShowUpdateBalance(false)}
          account={account}
          updateAccount={updateAccount}
        />
      )}
    </Card>
  )
}
