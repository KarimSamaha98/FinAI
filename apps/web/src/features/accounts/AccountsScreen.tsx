import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CARD_COLOR_PALETTE, type DisplayRow, type MonthSplit, type Transaction, type TransactionView } from 'shared-types'
import { DateRangePicker, type DateRange } from '../../components/DateRangePicker'
import { CategoryMultiSelect } from '../../components/CategoryMultiSelect'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Modal } from '../../components/Modal'
import { ActionMenu, type ActionMenuItem } from '../../components/ActionMenu'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { useTransactions } from '../../hooks/useTransactions'
import { useDisplayRows } from '../../hooks/useDisplayRows'
import { useReconciliationGroups } from '../../hooks/useReconciliationGroups'
import { useMonthSplits } from '../../hooks/useMonthSplits'
import { TransactionForm, type TransactionFormValues } from '../transactions/TransactionForm'
import { ReconcilePicker } from '../reconciliation/ReconcilePicker'
import { ReconciliationGroupModal } from '../reconciliation/ReconciliationGroupModal'
import { SplitModal } from '../month-split/SplitModal'
import { AccountCarousel } from './AccountCarousel'
import { nextAccountSelection } from '../../lib/accountSelection'
import { SelectionSummary } from './SelectionSummary'
import { AccountHeader } from './AccountHeader'
import { AccountForm } from './AccountForm'
import { TransactionRow } from './TransactionRow'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'

function toFormValues(transaction: Transaction): TransactionFormValues {
  return {
    date: transaction.date,
    type: transaction.amount < 0 ? 'expense' : 'income',
    amount: Math.abs(transaction.amount).toString(),
    currencyCode: transaction.currencyCode,
    description: transaction.description,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
  }
}

export function AccountsScreen() {
  const [searchParams] = useSearchParams()
  // Empty = every account selected (the default on arrival).
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const fromUrl = searchParams.get('selected')
    return fromUrl ? [fromUrl] : []
  })
  const [dateRange, setDateRange] = useState<DateRange>({})
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [view, setView] = useState<TransactionView>('real')
  const [showAccountForm, setShowAccountForm] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reconcileAnchor, setReconcileAnchor] = useState<Transaction | null>(null)
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null)
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null)
  const [actionRow, setActionRow] = useState<DisplayRow | null>(null)

  const { categories, activeCategories } = useCategories()
  const { accounts, loading: accountsLoading, error: accountsError, createAccount, uploadCardImage, refresh: refreshAccounts } = useAccounts()
  const accountIds = selectedIds
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null
  const { profiles: accountProfiles } = useImportProfiles(singleSelectedId ?? undefined)
  // Deliberately NOT scoped to accountIds — this is the candidate pool for
  // reconcile/split pickers and group-member lookups, which must be able to
  // find a transaction in a *different* account than the one currently
  // selected (e.g. reconciling a transfer between two accounts). Only the
  // visible ledger (`rows`, below) is account-scoped.
  const { transactions, loading, error, createTransaction, updateTransaction, deleteTransaction } = useTransactions(
    dateRange,
    categoryIds,
  )
  const { rows, loading: rowsLoading, error: rowsError, refresh: refreshRows } = useDisplayRows(
    dateRange,
    categoryIds,
    view,
    accountIds,
  )
  const { groups, createGroup, addMember, removeMember, deleteGroup } = useReconciliationGroups()
  const { splits, createSplit, updateSplit } = useMonthSplits()

  const selectedAccount = singleSelectedId ? accounts.find((a) => a.id === singleSelectedId) : undefined
  const summarizedAccounts = selectedIds.length === 0 ? accounts : accounts.filter((a) => selectedIds.includes(a.id))

  function handleToggleAccount(id: string) {
    setSelectedIds((current) =>
      nextAccountSelection(
        current,
        id,
        accounts.map((a) => a.id),
      ),
    )
  }

  function findTransaction(id: string): Transaction | undefined {
    return transactions.find((t) => t.id === id)
  }

  async function handleCreateGroup(label: string | null, transactionIds: string[]) {
    await createGroup(label, transactionIds)
    await refreshRows()
  }

  async function handleAddMember(groupId: string, transactionId: string) {
    await addMember(groupId, transactionId)
    await refreshRows()
  }

  async function handleRemoveMember(groupId: string, transactionId: string) {
    await removeMember(groupId, transactionId)
    await refreshRows()
    setViewingGroupId(null)
  }

  async function handleDeleteGroup(groupId: string) {
    await deleteGroup(groupId)
    await refreshRows()
    setViewingGroupId(null)
  }

  async function handleCreateSplit(transactionId: string, startMonth: string, numMonths: number) {
    await createSplit(transactionId, startMonth, numMonths)
    await refreshRows()
  }

  async function handleUpdateSplit(id: string, startMonth: string, numMonths: number) {
    await updateSplit(id, startMonth, numMonths)
    await refreshRows()
  }

  async function handleDeleteTransaction(id: string) {
    await deleteTransaction(id)
    await refreshRows()
    await refreshAccounts()
  }

  function actionsFor(row: DisplayRow): ActionMenuItem[] {
    if (row.kind === 'month_split_portion') {
      const transaction = findTransaction(row.sourceTransactionIds[0])
      if (!transaction) return []
      return [{ label: 'Edit split', onClick: () => setSplitTarget(transaction) }]
    }

    const anchorTransaction = findTransaction(row.sourceTransactionIds[0])
    if (!anchorTransaction) return []

    const actions: ActionMenuItem[] = []
    if (row.kind === 'plain') {
      actions.push({ label: 'Edit transaction', onClick: () => setEditingId(anchorTransaction.id) })
    }
    if (row.kind === 'reconciliation_net' && row.reconciliationGroupId) {
      const groupId = row.reconciliationGroupId
      actions.push({ label: 'View reconciliation group', onClick: () => setViewingGroupId(groupId) })
    }
    actions.push({ label: 'Split transaction', onClick: () => setSplitTarget(anchorTransaction) })
    actions.push({ label: 'Reconcile / group', onClick: () => setReconcileAnchor(anchorTransaction) })
    if (row.kind === 'plain') {
      actions.push({ label: 'Delete', variant: 'danger', onClick: () => handleDeleteTransaction(anchorTransaction.id) })
    }
    return actions
  }

  const editingTransaction = editingId ? findTransaction(editingId) : undefined
  const viewingGroup = viewingGroupId ? groups.find((g) => g.id === viewingGroupId) : undefined
  const editingSplit = splitTarget ? (splits.find((s: MonthSplit) => s.transactionId === splitTarget.id) ?? null) : null

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Transaction</h1>
        <Button variant="primary" onClick={() => setShowAddForm(true)}>
          + Add Transaction
        </Button>
      </div>
      {accountsError && <Alert variant="error">{accountsError}</Alert>}
      {!accountsLoading && (
        <AccountCarousel
          accounts={accounts}
          selectedIds={selectedIds}
          onToggle={handleToggleAccount}
        />
      )}

      {selectedAccount ? (
        <AccountHeader
          account={selectedAccount}
          hasProfile={accountProfiles.length > 0}
        />
      ) : (
        <SelectionSummary
          accounts={summarizedAccounts}
          allSelected={selectedIds.length === 0}
          onAddAccount={() => setShowAccountForm(true)}
        />
      )}

      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', margin: 'var(--space-4) 0' }}>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <CategoryMultiSelect categories={activeCategories} selectedIds={categoryIds} onChange={setCategoryIds} />
        <label>
          View
          <select value={view} onChange={(e) => setView(e.target.value as TransactionView)}>
            <option value="real">Real</option>
            <option value="nominal">Nominal</option>
          </select>
        </label>
      </div>

      {(loading || rowsLoading) && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {(error || rowsError) && <Alert variant="error">{error ?? rowsError}</Alert>}
      {!loading && !rowsLoading && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5) 0' }}>
          No transactions in this range yet.
        </p>
      )}

      <ul className="txn-list">
        {rows.map((row, index) => (
          <TransactionRow
            key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`}
            row={row}
            categories={categories}
            accounts={accounts}
            onClick={() => setActionRow(row)}
          />
        ))}
      </ul>

      {showAccountForm && (
        <AccountForm
          open={showAccountForm}
          onClose={() => setShowAccountForm(false)}
          createAccount={createAccount}
          uploadCardImage={uploadCardImage}
          defaultCardColor={CARD_COLOR_PALETTE[accounts.length % CARD_COLOR_PALETTE.length]}
          onCreated={(id) => setSelectedIds([id])}
        />
      )}

      {showAddForm && (
        <Modal open={showAddForm} onClose={() => setShowAddForm(false)} title="Add transaction">
          <TransactionForm
            categories={activeCategories}
            accounts={accounts}
            fixedAccountId={singleSelectedId}
            onSubmit={async (input) => {
              await createTransaction(input)
              await refreshRows()
              await refreshAccounts()
              setShowAddForm(false)
            }}
            onCancel={() => setShowAddForm(false)}
          />
        </Modal>
      )}

      {editingTransaction && (
        <Modal open={!!editingTransaction} onClose={() => setEditingId(null)} title="Edit transaction">
          <TransactionForm
            categories={activeCategories}
            accounts={accounts}
            fixedAccountId={null}
            initialValues={toFormValues(editingTransaction)}
            onSubmit={async (input) => {
              await updateTransaction(editingTransaction.id, input)
              await refreshRows()
              await refreshAccounts()
              setEditingId(null)
            }}
            onCancel={() => setEditingId(null)}
          />
        </Modal>
      )}

      {actionRow && (
        <ActionMenu
          open={!!actionRow}
          onClose={() => setActionRow(null)}
          title={formatCurrency(actionRow.amount, actionRow.currencyCode)}
          subtitle={`${formatDate(actionRow.date)} — ${actionRow.description || 'Untitled'}`}
          actions={actionsFor(actionRow)}
        />
      )}

      {reconcileAnchor && (
        <ReconcilePicker
          open={!!reconcileAnchor}
          onClose={() => setReconcileAnchor(null)}
          anchor={reconcileAnchor}
          existingGroup={groups.find((g) => g.memberTransactionIds.includes(reconcileAnchor.id)) ?? null}
          allGroups={groups}
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onCreateGroup={handleCreateGroup}
          onAddMember={handleAddMember}
        />
      )}

      {viewingGroup && (
        <ReconciliationGroupModal
          open={!!viewingGroup}
          onClose={() => setViewingGroupId(null)}
          group={viewingGroup}
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onRemoveMember={handleRemoveMember}
          onDeleteGroup={handleDeleteGroup}
        />
      )}

      {splitTarget && (
        <SplitModal
          open={!!splitTarget}
          onClose={() => setSplitTarget(null)}
          transaction={splitTarget}
          existingSplit={editingSplit}
          onCreate={handleCreateSplit}
          onUpdate={handleUpdateSplit}
        />
      )}
    </main>
  )
}
