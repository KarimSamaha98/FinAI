import { useEffect, useMemo, useRef, useState } from 'react'
import { CARD_COLOR_PALETTE, type DisplayRow, type MonthSplit, type Transaction, type TransactionView } from 'shared-types'
import { SelectDropdown } from '../../components/SelectDropdown'
import { SearchInput } from '../../components/SearchInput'
import { SortControl } from '../../components/SortControl'
import { DateRangePresetPicker } from '../../components/DateRangePresetPicker'
import { rangeFromParams, rangeToParams, type DateRangePreset } from '../../lib/dateRangePresets'
import { pickParam, useUrlState } from '../../hooks/useUrlState'
import { useScrollRestoreWhenReady } from '../../hooks/useScrollRestoreWhenReady'
import { CategoryMultiSelect } from '../../components/CategoryMultiSelect'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { apiClient, isFxUnavailable } from '../../lib/apiClient'
import { ActionMenu, type ActionMenuItem } from '../../components/ActionMenu'
import { LinkIcon, PencilIcon, SplitIcon, TrashIcon } from '../../components/icons'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useTransactions } from '../../hooks/useTransactions'
import { useDisplayRows } from '../../hooks/useDisplayRows'
import { useUncategorizedTransactions } from '../../hooks/useUncategorizedTransactions'
import { CategorizationDeck, type CategorizedRow } from '../import/CategorizationDeck'
import { UncategorizedNotice } from './UncategorizedNotice'
import { useReconciliationGroups } from '../../hooks/useReconciliationGroups'
import { useMonthSplits } from '../../hooks/useMonthSplits'
import { TransactionForm, type TransactionFormValues } from '../transactions/TransactionForm'
import { AddTransactionWizard } from '../transactions/AddTransactionWizard'
import { CsvWizardHost } from '../import/CsvWizardHost'
import { ReconcilePicker } from '../reconciliation/ReconcilePicker'
import { ReconciliationGroupModal } from '../reconciliation/ReconciliationGroupModal'
import { SplitModal } from '../month-split/SplitModal'
import { AccountCarousel } from './AccountCarousel'
import { nextAccountSelection } from '../../lib/accountSelection'
import { SelectionSummary } from './SelectionSummary'
import { AccountHeader } from './AccountHeader'
import { AccountWizard } from './AccountWizard'
import { TransactionRow } from './TransactionRow'
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

const LEDGER_DEFAULT_RANGE: DateRangePreset = 'current-month'

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
  // Every ledger setting lives in the URL, so Back (from account settings, or
  // to Insights and forward again) and reload bring the view back as it was:
  // ?selected=id1,id2 (cards; empty = all), ?range= or ?from=&to=, ?category=,
  // ?view=, ?sort=&dir=, ?q=. Defaults are left out. Insights' breakdowns
  // link here ("Open in Transactions") with ?from=&to=&category=.
  const [searchParams, updateParams] = useUrlState()
  const selectedParam = searchParams.get('selected') ?? ''
  const selectedIds = useMemo(() => selectedParam.split(',').filter(Boolean), [selectedParam])
  function setSelectedIds(ids: string[]) {
    updateParams({ selected: ids.join(',') })
  }
  const rangeSelection = rangeFromParams(searchParams, LEDGER_DEFAULT_RANGE)
  const dateRange = rangeSelection.range
  const categoryParam = searchParams.get('category') ?? ''
  const categoryIds = useMemo(() => categoryParam.split(',').filter(Boolean), [categoryParam])
  const view = pickParam<TransactionView>(searchParams, 'view', ['real', 'nominal'], 'real')
  const sortField = pickParam<SortField>(searchParams, 'sort', ['date', 'amount', 'description', 'account'], DEFAULT_SORT_FIELD)
  const sortDirection = pickParam<SortDirection>(searchParams, 'dir', ['asc', 'desc'], DEFAULT_SORT_DIRECTION)
  // The search box is local (so typing never waits on navigation) and mirrored to ?q=.
  const urlSearch = searchParams.get('q') ?? ''
  const [search, setSearch] = useState(urlSearch)
  useEffect(() => {
    if (search !== urlSearch) updateParams({ q: search })
    // Only typing drives this; the URL is read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  // At most one setup wizard is open. Wizards hand over only from their final
  // screen (Add account → Set up CSV import / Add a transaction); `handoff`
  // makes the next one appear without animating in, so it reads as continuing.
  const [wizard, setWizard] = useState<
    | null
    | { kind: 'account' }
    | { kind: 'transaction'; fixedAccountId: string | null; handoff?: boolean }
    | { kind: 'csv-setup'; accountId: string; handoff?: boolean }
  >(null)
  const closeWizard = () => setWizard(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [reconcileAnchor, setReconcileAnchor] = useState<Transaction | null>(null)
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null)
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null)
  const [actionRow, setActionRow] = useState<DisplayRow | null>(null)

  const { categories, activeCategories } = useCategories()
  const { accounts, loading: accountsLoading, error: accountsError, createAccount, uploadCardImage, refresh: refreshAccounts } = useAccounts()
  const accountIds = selectedIds
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null
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
  /** A CSV import finished: show the account it went into, with everything refreshed. */
  async function handleImported(accountId: string) {
    closeWizard()
    setSelectedIds([accountId])
    await Promise.all([refreshLedger(), refreshAccounts(), refreshTransactions()])
  }

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
  // Back from account settings returns to the same spot in the list, once it has loaded.
  useScrollRestoreWhenReady(!loading && !rowsLoading && !accountsLoading)
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
  // Accounts are only ambiguous when more than one is in view (all, or several).
  const showAccountPerRow = selectedIds.length !== 1

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
      return [{ label: 'Edit split', detail: 'Change how it’s spread across months', icon: <SplitIcon />, onClick: () => setSplitTarget(transaction) }]
    }

    const anchorTransaction = findTransaction(row.sourceTransactionIds[0])
    if (!anchorTransaction) return []

    const actions: ActionMenuItem[] = []
    if (row.kind === 'plain') {
      actions.push({
        label: 'Edit transaction',
        detail: 'Change the amount, date, category or account',
        icon: <PencilIcon />,
        onClick: () => setEditingId(anchorTransaction.id),
      })
    }
    if (row.kind === 'reconciliation_net' && row.reconciliationGroupId) {
      const groupId = row.reconciliationGroupId
      actions.push({
        label: 'Manage linked transactions',
        detail: 'See or change the transactions it’s linked with',
        icon: <LinkIcon />,
        onClick: () => setViewingGroupId(groupId),
      })
    }
    actions.push({ label: 'Split transaction', detail: 'Spread it across several months', icon: <SplitIcon />, onClick: () => setSplitTarget(anchorTransaction) })
    actions.push({
      label: 'Link transactions',
      detail: 'Match it with a transfer or refund elsewhere',
      icon: <LinkIcon />,
      onClick: () => setReconcileAnchor(anchorTransaction),
    })
    if (row.kind === 'plain') {
      actions.push({
        label: 'Delete',
        detail: 'Remove it from your transactions',
        icon: <TrashIcon />,
        variant: 'danger',
        confirm: {
          title: 'Delete this transaction?',
          message: `${formatDate(anchorTransaction.date)} — ${anchorTransaction.description || 'Untitled'} will be removed. This can’t be undone.`,
          confirmLabel: 'Delete',
        },
        onClick: () => handleDeleteTransaction(anchorTransaction.id),
      })
    }
    return actions
  }

  const editingTransaction = editingId ? findTransaction(editingId) : undefined
  const viewingGroup = viewingGroupId ? groups.find((g) => g.id === viewingGroupId) : undefined
  const editingSplit = splitTarget ? (splits.find((s: MonthSplit) => s.transactionId === splitTarget.id) ?? null) : null

  // A failed exchange-rate fetch means balances can't be converted to home —
  // fail loudly (like Home) rather than showing misleading partial totals.
  if (isFxUnavailable(accountsError) || isFxUnavailable(error) || isFxUnavailable(rowsError)) {
    return (
      <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <h1>Transactions</h1>
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
        <h1>Transactions</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => setWizard({ kind: 'account' })}>
            + Add Account
          </Button>
          <Button variant="primary" onClick={() => setWizard({ kind: 'transaction', fixedAccountId: singleSelectedId })}>
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
        />
      ) : (
        <SelectionSummary
          accounts={summarizedAccounts}
          allSelected={selectedIds.length === 0}
        />
      )}

      <UncategorizedNotice count={uncategorized.length} onOpen={openCategorizeDeck} />
      <div className="filter-bar" style={{ margin: 'var(--space-4) 0' }}>
        <DateRangePresetPicker value={rangeSelection} onChange={(next) => updateParams(rangeToParams(next, LEDGER_DEFAULT_RANGE))} />
        <CategoryMultiSelect categories={activeCategories} selectedIds={categoryIds} onChange={(ids) => updateParams({ category: ids.join(',') })} />
        <SelectDropdown<TransactionView>
          label="View"
          value={view}
          options={[
            { value: 'real', label: 'Real' },
            { value: 'nominal', label: 'Nominal' },
          ]}
          onChange={(next) => updateParams({ view: next === 'real' ? null : next })}
        />
        <SortControl
          field={sortField}
          direction={sortDirection}
          onFieldChange={(next) => updateParams({ sort: next === DEFAULT_SORT_FIELD ? null : next })}
          onDirectionChange={(next) => updateParams({ dir: next === DEFAULT_SORT_DIRECTION ? null : next })}
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
              splitByTransactionId={splitByTransactionId}
              showAccount={showAccountPerRow}
              onClick={() => setActionRow(row)}
            />
          ))}
        </ul>
      )}

      {wizard?.kind === 'account' && (
        <AccountWizard
          open
          onClose={closeWizard}
          createAccount={createAccount}
          uploadCardImage={uploadCardImage}
          defaultCardColor={CARD_COLOR_PALETTE[accounts.length % CARD_COLOR_PALETTE.length]}
          onCreated={(id) => setSelectedIds([id])}
          onSetupCsv={(id) => setWizard({ kind: 'csv-setup', accountId: id, handoff: true })}
          onAddTransaction={(id) => setWizard({ kind: 'transaction', fixedAccountId: id, handoff: true })}
        />
      )}

      {wizard?.kind === 'transaction' && (
        <AddTransactionWizard
          open
          onClose={closeWizard}
          categories={activeCategories}
          accounts={accounts}
          fixedAccountId={wizard.fixedAccountId}
          animateIn={!wizard.handoff}
          onCreate={async (input) => {
            await createTransaction(input)
            await refreshLedger()
            await refreshAccounts()
            closeWizard()
          }}
          onImported={handleImported}
        />
      )}

      {wizard?.kind === 'csv-setup' && (
        <CsvWizardHost
          open
          onClose={closeWizard}
          animateIn={!wizard.handoff}
          start={{ kind: 'profile', accountId: wizard.accountId, account: accounts.find((a) => a.id === wizard.accountId) }}
          onImported={handleImported}
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
          title={actionRow.description || 'Untitled'}
          summary={{
            detail: [formatDate(actionRow.date), accounts.find((a) => a.id === (actionRow.anchorAccountId ?? actionRow.accountIds[0]))?.name]
              .filter(Boolean)
              .join(' · '),
            value: formatCurrency(actionRow.amount, actionRow.currencyCode),
            tone: actionRow.amount < 0 ? 'negative' : 'positive',
          }}
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
