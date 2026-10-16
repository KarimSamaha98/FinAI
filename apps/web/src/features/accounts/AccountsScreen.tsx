import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CARD_COLOR_PALETTE, type DisplayRow, type MonthSplit, type Transaction, type TransactionView } from 'shared-types'
import { SelectDropdown } from '../../components/SelectDropdown'
import { SearchInput } from '../../components/SearchInput'
import { SortControl } from '../../components/SortControl'
import { type DateRange } from '../../components/DateRangePicker'
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker'
import { getPresetRange } from '../../lib/dateRangePresets'
import { CategoryMultiSelect } from '../../components/CategoryMultiSelect'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { apiClient, isFxUnavailable } from '../../lib/apiClient'
import { ActionMenu, type ActionMenuItem } from '../../components/ActionMenu'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { useTransactions } from '../../hooks/useTransactions'
import { useDisplayRows } from '../../hooks/useDisplayRows'
import { useUncategorizedTransactions } from '../../hooks/useUncategorizedTransactions'
import { CategorizationDeck, type CategorizedRow } from '../import/CategorizationDeck'
import { UncategorizedNotice } from './UncategorizedNotice'
import { useReconciliationGroups } from '../../hooks/useReconciliationGroups'
import { useMonthSplits } from '../../hooks/useMonthSplits'
import { TransactionForm, type TransactionFormValues } from '../transactions/TransactionForm'
import { AddTransactionDialog } from '../transactions/AddTransactionDialog'
import { ReconcilePicker } from '../reconciliation/ReconcilePicker'
import { ReconciliationGroupModal } from '../reconciliation/ReconciliationGroupModal'
import { SplitModal } from '../month-split/SplitModal'
import { AccountCarousel } from './AccountCarousel'
import { nextAccountSelection } from '../../lib/accountSelection'
import { SelectionSummary } from './SelectionSummary'
import { AccountHeader } from './AccountHeader'
import { AccountForm } from './AccountForm'
import { TransactionRow, type RowAction } from './TransactionRow'
import { SplitIcon, LinkIcon } from '../../components/icons'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import {
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_FIELD,
  filterRowsByDescription,
  sortDisplayRows,
  type SortDirection,
  type SortField,
} from '../../lib/transactionSort'

function toFormValues(transaction: Transaction): TransactionFormValues {
  return {
    date: transaction.date,
    type: transaction.amount < 0 ? 'expense' : 'income',
    amount: Math.abs(transaction.amount).toString(),
    currencyCode: transaction.currencyCode,
    description: transaction.description,
    categoryId: transaction.categoryId,
    accountId: transaction.accountId,
    fxMode: transaction.rateSource,
    fxRateOverride: transaction.rateSource === 'manual' && transaction.exchangeRate != null ? String(transaction.exchangeRate) : '',
  }
}

export function AccountsScreen() {
  const [searchParams, setSearchParams] = useSearchParams()
  // The card selection lives in the URL (?selected=id1,id2) so Back and reload
  // restore it. Empty = every account selected (the default on arrival).
  const selectedParam = searchParams.get('selected') ?? ''
  const selectedIds = useMemo(() => selectedParam.split(',').filter(Boolean), [selectedParam])
  function setSelectedIds(ids: string[]) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (ids.length) next.set('selected', ids.join(','))
        else next.delete('selected')
        return next
      },
      // Toggling cards shouldn't add history entries — Back leaves the page.
      { replace: true },
    )
  }
  const [dateRange, setDateRange] = useState<DateRange>(() => getPresetRange('current-month'))
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [view, setView] = useState<TransactionView>('real')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>(DEFAULT_SORT_FIELD)
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION)
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
  const { profiles: accountProfiles, loading: accountProfilesLoading } = useImportProfiles(singleSelectedId ?? undefined)
  // Deliberately NOT scoped to accountIds — this is the candidate pool for
  // reconcile/split pickers and group-member lookups, which must be able to
  // find a transaction in a *different* account than the one currently
  // selected (e.g. reconciling a transfer between two accounts). Only the
  // visible ledger (`rows`, below) is account-scoped.
  const { transactions, loading, error, refresh: refreshTransactions, createTransaction, updateTransaction, deleteTransaction } = useTransactions(
    dateRange,
    categoryIds,
  )
  const { transactions: uncategorized, refresh: refreshUncategorized, categorize } = useUncategorizedTransactions(accountIds)
  const [showCategorizeDeck, setShowCategorizeDeck] = useState(false)

  /** Anything that can add, remove or recategorize a transaction also updates the uncategorized notice. */
  async function refreshLedger() {
    await Promise.all([refreshRows(), refreshUncategorized()])
  }

  // Choices made so far in the categorize deck, so closing it (✕) still saves them.
  const deckProgressRef = useRef<CategorizedRow[]>([])

  function openCategorizeDeck() {
    deckProgressRef.current = []
    setShowCategorizeDeck(true)
  }

  async function handleCategorizeDone(categorized: CategorizedRow[]) {
    const assignments = categorized.flatMap(({ rowIndex, categoryId }) =>
      categoryId ? [{ transactionId: uncategorized[rowIndex].id, categoryId }] : [],
    )
    // Close first: saving shrinks the uncategorized list the open deck is reading from.
    setShowCategorizeDeck(false)
    if (assignments.length > 0) {
      await categorize(assignments)
      await Promise.all([refreshRows(), refreshTransactions()])
    }
  }
  const { rows, loading: rowsLoading, error: rowsError, refresh: refreshRows } = useDisplayRows(
    dateRange,
    categoryIds,
    view,
    accountIds,
  )
  const { groups, createGroup, addMember, removeMember, deleteGroup } = useReconciliationGroups()
  const { splits, createSplit, updateSplit } = useMonthSplits()

  // Search + sort are presentation-only over the already-tenant-scoped rows.
  const accountNameById = useMemo(() => new Map(accounts.map((a) => [a.id, a.name])), [accounts])
  const visibleRows = useMemo(
    () => sortDisplayRows(filterRowsByDescription(rows, search), sortField, sortDirection, accountNameById),
    [rows, search, sortField, sortDirection, accountNameById],
  )
  const splitByTransactionId = useMemo(() => new Map(splits.map((s) => [s.transactionId, s])), [splits])

  const selectedAccount = singleSelectedId ? accounts.find((a) => a.id === singleSelectedId) : undefined
  const summarizedAccounts = selectedIds.length === 0 ? accounts : accounts.filter((a) => selectedIds.includes(a.id))

  function handleToggleAccount(id: string) {
    setSelectedIds(
      nextAccountSelection(
        selectedIds,
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
    await refreshLedger()
  }

  async function handleAddMember(groupId: string, transactionId: string) {
    await addMember(groupId, transactionId)
    await refreshLedger()
  }

  async function handleRemoveMember(groupId: string, transactionId: string) {
    await removeMember(groupId, transactionId)
    await refreshLedger()
    setViewingGroupId(null)
  }

  async function handleDeleteGroup(groupId: string) {
    await deleteGroup(groupId)
    await refreshLedger()
    setViewingGroupId(null)
  }

  async function handleCreateSplit(transactionId: string, startMonth: string, numMonths: number) {
    await createSplit(transactionId, startMonth, numMonths)
    await refreshLedger()
  }

  async function handleUpdateSplit(id: string, startMonth: string, numMonths: number) {
    await updateSplit(id, startMonth, numMonths)
    await refreshLedger()
  }

  async function handleDeleteTransaction(id: string) {
    await deleteTransaction(id)
    await refreshLedger()
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

  // Quick actions revealed on row hover/focus — the discoverable entry points
  // to the split/group flows that used to live only inside the row's modal.
  function quickActionsFor(row: DisplayRow): RowAction[] {
    const transaction = findTransaction(row.sourceTransactionIds[0])
    if (!transaction) return []
    if (row.kind === 'month_split_portion') {
      return [{ key: 'edit-split', label: 'Edit split', icon: <SplitIcon />, onClick: () => setSplitTarget(transaction) }]
    }
    if (row.kind === 'plain') {
      return [
        { key: 'split', label: 'Split transaction', icon: <SplitIcon />, onClick: () => setSplitTarget(transaction) },
        { key: 'link', label: 'Link to another transaction', icon: <LinkIcon />, onClick: () => setReconcileAnchor(transaction) },
      ]
    }
    return []
  }

  const editingTransaction = editingId ? findTransaction(editingId) : undefined
  const viewingGroup = viewingGroupId ? groups.find((g) => g.id === viewingGroupId) : undefined
  const editingSplit = splitTarget ? (splits.find((s: MonthSplit) => s.transactionId === splitTarget.id) ?? null) : null

  // A failed exchange-rate fetch means balances can't be converted to home —
  // fail loudly (like Home) rather than showing misleading partial totals.
  if (isFxUnavailable(accountsError) || isFxUnavailable(error) || isFxUnavailable(rowsError)) {
    return (
      <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <h1>Transaction</h1>
        <Card className="home-empty">
          <h2>Fetching data failed</h2>
          <p>We couldn&apos;t fetch exchange rates, so your balances and totals can&apos;t be shown right now.</p>
          <Button
            variant="primary"
            onClick={() => {
              // Repair any transactions left unpriced (a provider outage at write
              // time) before re-reading, so a retry can actually recover.
              void (async () => {
                await apiClient.post('/fx/sync').catch(() => {})
                await Promise.all([refreshAccounts(), refreshTransactions(), refreshRows()])
              })()
            }}
          >
            Try again
          </Button>
        </Card>
      </main>
    )
  }

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Transaction</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => setShowAccountForm(true)}>
            + Add Account
          </Button>
          <Button variant="primary" onClick={() => setShowAddForm(true)}>
            + Add Transaction
          </Button>
        </div>
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
          hasProfile={accountProfilesLoading ? null : accountProfiles.length > 0}
        />
      ) : (
        <SelectionSummary
          accounts={summarizedAccounts}
          allSelected={selectedIds.length === 0}
        />
      )}

      <UncategorizedNotice count={uncategorized.length} onOpen={openCategorizeDeck} />
      <div className="filter-bar" style={{ margin: 'var(--space-4) 0' }}>
        <DateRangePresetPicker value={dateRange} onChange={setDateRange} />
        <CategoryMultiSelect categories={activeCategories} selectedIds={categoryIds} onChange={setCategoryIds} />
        <SelectDropdown<TransactionView>
          label="View"
          value={view}
          options={[
            { value: 'real', label: 'Real' },
            { value: 'nominal', label: 'Nominal' },
          ]}
          onChange={setView}
        />
        <SortControl
          field={sortField}
          direction={sortDirection}
          onFieldChange={setSortField}
          onDirectionChange={setSortDirection}
        />
        <SearchInput value={search} onChange={setSearch} aria-label="Search transactions by description" />
      </div>

      {(loading || rowsLoading) && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {(error || rowsError) && <Alert variant="error">{error ?? rowsError}</Alert>}
      {!loading && !rowsLoading && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5) 0' }}>
          No transactions in this range yet.
        </p>
      )}
      {!loading && !rowsLoading && rows.length > 0 && visibleRows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5) 0' }}>
          No transactions match your search.
        </p>
      )}

      {visibleRows.length > 0 && (
        <ul className="txn-list">
          {visibleRows.map((row, index) => (
            <TransactionRow
              key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`}
              row={row}
              categories={categories}
              accounts={accounts}
              transactions={transactions}
              splitByTransactionId={splitByTransactionId}
              actions={quickActionsFor(row)}
              onClick={() => setActionRow(row)}
            />
          ))}
        </ul>
      )}

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
        <AddTransactionDialog
          open={showAddForm}
          onClose={() => setShowAddForm(false)}
          categories={activeCategories}
          accounts={accounts}
          fixedAccountId={singleSelectedId}
          onCreate={async (input) => {
            await createTransaction(input)
            await refreshLedger()
            await refreshAccounts()
            setShowAddForm(false)
          }}
        />
      )}

      {showCategorizeDeck && (
        <Modal open={showCategorizeDeck} onClose={() => handleCategorizeDone(deckProgressRef.current)} title="Categorize transactions">
          <CategorizationDeck
            rows={uncategorized.map((t, rowIndex) => ({
              rowIndex,
              date: t.date,
              amount: t.amount,
              currencyCode: t.currencyCode,
              description: t.description,
              suggestedCategoryId: null,
            }))}
            categories={activeCategories}
            skipHint="Skipped transactions stay Uncategorized — close anytime and your choices so far are saved."
            showSkipAll={false}
            onProgress={(categorized) => {
              deckProgressRef.current = categorized
            }}
            onDone={handleCategorizeDone}
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
            allowFxOverride
            onSubmit={async (input) => {
              await updateTransaction(editingTransaction.id, input)
              await refreshLedger()
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
