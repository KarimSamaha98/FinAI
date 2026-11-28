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
import { SkeletonRows } from '../../components/Skeleton'
import { apiClient, isFxUnavailable } from '../../lib/apiClient'
import { ActionMenu, type ActionMenuItem } from '../../components/ActionMenu'
import { CheckIcon, FlagIcon, LinkIcon, PencilIcon, SplitIcon, TransferIcon, TrashIcon } from '../../components/icons'
import { useCategories } from '../../hooks/useCategories'
import { useAccounts } from '../../hooks/useAccounts'
import { useTransactions } from '../../hooks/useTransactions'
import { useDisplayRows } from '../../hooks/useDisplayRows'
import { useUncategorizedTransactions } from '../../hooks/useUncategorizedTransactions'
import { CategorizationDeck, type CategorizedRow } from '../import/CategorizationDeck'
import { UncategorizedNotice } from './UncategorizedNotice'
import { FlaggedNotice } from './FlaggedNotice'
import { useFlaggedTransactions } from '../../hooks/useFlaggedTransactions'
import { useGroups } from '../../hooks/useGroups'
import { useMonthSplits } from '../../hooks/useMonthSplits'
import { TransactionForm, type TransactionFormValues } from '../transactions/TransactionForm'
import { AddTransactionWizard } from '../transactions/AddTransactionWizard'
import { CsvWizardHost } from '../import/CsvWizardHost'
import { GroupWizard, type GroupMainTransaction } from '../groups/GroupWizard'
import { GroupModal } from '../groups/GroupModal'
import { TransferModal } from '../groups/TransferModal'
import { TransferWizard } from '../groups/TransferWizard'
import { SplitModal } from '../month-split/SplitModal'
import { apiErrorMessage } from '../../hooks/usePeople'
import { AccountCarousel } from './AccountCarousel'
import { nextAccountSelection } from '../../lib/accountSelection'
import { SelectionSummary } from './SelectionSummary'
import { AccountHeader } from './AccountHeader'
import { AccountWizard } from './AccountWizard'
import { TransactionRow } from './TransactionRow'
import { formatCurrency } from '../../lib/formatCurrency'
import { formatDate } from '../../lib/formatDate'
import { TransactionList } from './TransactionList'
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
  // ?flagged=1: only what's flagged as needing attention. Turning it on
  // switches the range to All dates (an old range mustn't hide a flag) but
  // the range stays editable; turning it off restores the range from before.
  const flaggedOnly = searchParams.get('flagged') === '1'
  const dateRange = rangeSelection.range
  const rangeBeforeFlagged = useRef<ReturnType<typeof rangeToParams> | null>(null)
  function setFlaggedOnly(on: boolean) {
    if (on) {
      rangeBeforeFlagged.current = rangeToParams(rangeSelection, LEDGER_DEFAULT_RANGE)
      updateParams({ flagged: '1', ...rangeToParams({ preset: 'all', range: {} }, LEDGER_DEFAULT_RANGE) })
    } else {
      // Only if the range is still the All dates we switched to: a range picked
      // while filtering is the user's choice and stays.
      const restore = rangeSelection.preset === 'all' ? rangeBeforeFlagged.current : null
      updateParams({ flagged: null, ...(restore ?? {}) })
      rangeBeforeFlagged.current = null
    }
  }
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
  const [splitTarget, setSplitTarget] = useState<Transaction | null>(null)
  // The group open in its sheet, and the group wizard (a new group from a transaction, or editing one).
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null)
  const [grouping, setGrouping] = useState<{ transaction: GroupMainTransaction } | { groupId: string } | null>(null)
  const [transferring, setTransferring] = useState<Transaction | null>(null)
  const [actionRow, setActionRow] = useState<DisplayRow | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { categories, activeCategories } = useCategories()
  const { accounts, loading: accountsLoading, error: accountsError, createAccount, uploadCardImage, refresh: refreshAccounts } = useAccounts()
  const accountIds = selectedIds
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : null
  // Deliberately NOT scoped to accountIds — rows' actions look their
  // transactions up here, and a group's can be in a *different* account
  // than the one currently selected (e.g. a transfer between two accounts).
  // Only the visible ledger (`rows`, below) is account-scoped.
  const { transactions, loading, error, refresh: refreshTransactions, createTransaction, updateTransaction, deleteTransaction, setFlagged } = useTransactions(
    dateRange,
    categoryIds,
  )
  const { transactions: uncategorized, refresh: refreshUncategorized, categorize } = useUncategorizedTransactions(accountIds)
  const { count: flaggedCount } = useFlaggedTransactions(accountIds)
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
  const { rows, loading: rowsLoading, updating: rowsUpdating, error: rowsError, refresh: refreshRows } = useDisplayRows(
    dateRange,
    categoryIds,
    view,
    accountIds,
    flaggedOnly,
  )
  // Back from account settings returns to the same spot in the list, once it has loaded.
  useScrollRestoreWhenReady(!loading && !rowsLoading && !accountsLoading)
  const { groups } = useGroups()
  const transferGroupIds = useMemo(() => new Set(groups.filter((g) => g.kind === 'transfer').map((g) => g.id)), [groups])
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

  async function handleCreateSplit(transactionId: string, startMonth: string, numMonths: number) {
    await createSplit(transactionId, startMonth, numMonths)
    await refreshLedger()
  }

  async function handleUpdateSplit(id: string, startMonth: string, numMonths: number) {
    await updateSplit(id, startMonth, numMonths)
    await refreshLedger()
  }

  async function handleDeleteTransaction(id: string) {
    setActionError(null)
    try {
      await deleteTransaction(id)
    } catch (err) {
      setActionError(apiErrorMessage(err, 'Couldn’t delete the transaction'))
      return
    }
    await refreshLedger()
    await refreshAccounts()
  }

  function actionsFor(row: DisplayRow): ActionMenuItem[] {
    // Works from the row alone (every kind; a group flags all its
    // transactions), so it's always there, even for rows outside the
    // transactions loaded for the other actions.
    const flagAction: ActionMenuItem = row.flagged
      ? { label: 'Mark as done', detail: 'Clear the flag', icon: <CheckIcon />, onClick: () => setFlagged(row.sourceTransactionIds, false) }
      : { label: 'Flag for later', detail: 'Mark it as needing attention', icon: <FlagIcon />, onClick: () => setFlagged(row.sourceTransactionIds, true) }

    if (row.kind === 'month_split_portion') {
      const transaction = findTransaction(row.sourceTransactionIds[0])
      if (!transaction) return [flagAction]
      return [flagAction, { label: 'Edit split', detail: 'Change how it’s spread across months', icon: <SplitIcon />, onClick: () => setSplitTarget(transaction) }]
    }

    // Two ways to tie transactions together: a group (people who share it,
    // a refund that nets out with it) and a transfer (money moving between
    // the user's own accounts). A row already in one opens it.
    const groupId = row.reconciliationGroupId
    const isTransfer = groupId !== null && (row.transfer !== null || groups.find((g) => g.id === groupId)?.kind === 'transfer')
    const openAction: ActionMenuItem | null = !groupId
      ? null
      : isTransfer
        ? { label: 'Open transfer', detail: 'See both sides, or unmatch it', icon: <TransferIcon />, onClick: () => setViewingGroupId(groupId) }
        : {
            label: 'Open group',
            detail: row.people ? 'What’s in it, who’s paid and what’s still expected' : 'See or change what’s in it',
            icon: <LinkIcon />,
            onClick: () => setViewingGroupId(groupId),
          }
    const anchorTransaction = findTransaction(row.sourceTransactionIds[0])
    if (!anchorTransaction) return openAction ? [flagAction, openAction] : [flagAction]

    const actions: ActionMenuItem[] = [flagAction]
    if (openAction) {
      actions.push(openAction)
    } else if (anchorTransaction.amount !== 0) {
      actions.push({
        label: 'Group',
        detail: 'With people who share it, or a refund that nets out with it',
        icon: <LinkIcon />,
        onClick: () => setGrouping({ transaction: anchorTransaction }),
      })
      if (anchorTransaction.accountId && accounts.length > 1) {
        actions.push({
          label: 'Match transfer',
          detail: anchorTransaction.amount < 0 ? 'Money moved to another of your accounts, or a card payment' : 'Money moved in from another of your accounts',
          icon: <TransferIcon />,
          onClick: () => setTransferring(anchorTransaction),
        })
      }
    }
    if (row.kind === 'plain') {
      actions.push({
        label: 'Edit transaction',
        detail: 'Change the amount, date, category or account',
        icon: <PencilIcon />,
        onClick: () => setEditingId(anchorTransaction.id),
      })
    }
    // A grouped transaction can't also be spread over months (it would count twice).
    if (!groupId) {
      actions.push({ label: 'Split across months', detail: 'Spread it across several months', icon: <SplitIcon />, onClick: () => setSplitTarget(anchorTransaction) })
    }
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
  const editingGroup = grouping && 'groupId' in grouping ? groups.find((g) => g.id === grouping.groupId) : undefined
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

      {actionError && <Alert variant="error">{actionError}</Alert>}
      <UncategorizedNotice count={uncategorized.length} onOpen={openCategorizeDeck} />
      {!flaggedOnly && <FlaggedNotice count={flaggedCount} onOpen={() => setFlaggedOnly(true)} />}
      {/* Search on its own full-width row, the filters beneath it: a layout
          that reads as intended at every width instead of wrapping by accident. */}
      <div className="filter-bar" style={{ margin: 'var(--space-4) 0' }}>
        <SearchInput value={search} onChange={setSearch} aria-label="Search transactions by description" />
        <DateRangePresetPicker value={rangeSelection} onChange={(next) => updateParams(rangeToParams(next, LEDGER_DEFAULT_RANGE))} allowAllDates />
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
        <button type="button" className="dropdown-trigger filter-toggle" aria-pressed={flaggedOnly} onClick={() => setFlaggedOnly(!flaggedOnly)}>
          <FlagIcon />
          Flagged
        </button>
      </div>

      {/* First-ever load only: afterwards the cached list shows at once, and a
          filter change keeps it on screen (dimmed) until the new one arrives. */}
      {rowsLoading && <SkeletonRows count={8} />}
      {(error || rowsError) && <Alert variant="error">{error ?? rowsError}</Alert>}
      {!rowsLoading && !rowsUpdating && rows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5) 0' }}>
          {flaggedOnly
            ? rangeSelection.preset === 'all'
              ? 'Nothing flagged. Use “Flag for later” on a transaction to come back to it.'
              : 'Nothing flagged in this range.'
            : 'No transactions in this range yet.'}
        </p>
      )}
      {!rowsLoading && rows.length > 0 && visibleRows.length === 0 && (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--space-5) 0' }}>
          No transactions match your search.
        </p>
      )}

      {visibleRows.length > 0 && (
        <TransactionList className={rowsUpdating ? 'is-updating' : undefined} aria-busy={rowsUpdating}>
          {visibleRows.map((row, index) => (
            <TransactionRow
              key={`${row.kind}-${index}-${row.sourceTransactionIds[0]}`}
              row={row}
              categories={categories}
              accounts={accounts}
              splitByTransactionId={splitByTransactionId}
              showAccount={showAccountPerRow}
              view={view}
              transferGroupIds={transferGroupIds}
              onClick={() => setActionRow(row)}
            />
          ))}
        </TransactionList>
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

      {viewingGroup?.kind === 'transfer' && <TransferModal group={viewingGroup} accounts={accounts} onClose={() => setViewingGroupId(null)} />}
      {viewingGroup && viewingGroup.kind !== 'transfer' && (
        <GroupModal
          group={viewingGroup}
          accounts={accounts}
          onClose={() => setViewingGroupId(null)}
          onEdit={() => {
            setViewingGroupId(null)
            setGrouping({ groupId: viewingGroup.id })
          }}
        />
      )}

      {grouping && 'transaction' in grouping && <GroupWizard transaction={grouping.transaction} onClose={() => setGrouping(null)} />}
      {editingGroup && <GroupWizard group={editingGroup} onClose={() => setGrouping(null)} />}
      {transferring && <TransferWizard transaction={transferring} accounts={accounts} onClose={() => setTransferring(null)} />}

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
