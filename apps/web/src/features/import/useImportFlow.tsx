import { useRef, useState, type ReactNode } from 'react'
import type { CommitImportRunResult, ParseWithProfileResult } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { useCategories } from '../../hooks/useCategories'
import { useImportProfiles } from '../../hooks/useImportProfiles'
import { useAccounts } from '../../hooks/useAccounts'
import { Alert } from '../../components/Alert'
import { WizardStep, type WizardFooterProps } from '../../components/WizardFooter'
import { WizardResult } from '../../components/WizardResult'
import { UploadDropzone } from './UploadDropzone'
import { ChooseAccountStep } from './ChooseAccountStep'
import { CategorizationDeck, type CategorizedRow } from './CategorizationDeck'
import { ImportReview } from './ImportReview'
import { fileOf, type CsvFlowView, type UploadedFile } from './useProfileSetup'

/**
 * How an import starts:
 * - `pick`: choose the account, then upload (from Add transactions);
 *   `preselectAccountId` pre-selects it when it can import.
 * - `file`: account and file are known (straight after "Set up CSV profile"),
 *   so it reads the file and opens at Categorize.
 */
export type ImportEntry =
  | { mode: 'pick'; preselectAccountId?: string | null }
  | { mode: 'file'; accountId: string; uploaded: UploadedFile; importProfileId: string }

type Choices = Record<number, string | null>

interface Parsed extends UploadedFile {
  accountId: string
  parseResult: ParseWithProfileResult
  choices: Choices
}

type Step =
  | { name: 'account' }
  | { name: 'file'; accountId: string }
  | ({ name: 'categorize' } & Parsed)
  | ({ name: 'review' } & Parsed)
  | { name: 'imported'; accountId: string; importedCount: number; warning: string | null }
  /** The file had nothing new: shown on the final step, nothing to import. */
  | ({ name: 'nothingNew'; skippedDuplicateCount: number; accountId: string } & UploadedFile)

const STEPS = [
  { key: 'account', label: 'Account' },
  { key: 'file', label: 'File' },
  { key: 'categorize', label: 'Categorize' },
  { key: 'review', label: 'Review' },
  { key: 'imported', label: 'Imported' },
]

interface ImportFlowOptions {
  /** Show this import from the first render; start() is still needed to read a `file` entry. */
  initialEntry?: ImportEntry | null
  /** Back from the first step (to the screen before the wizard, e.g. Add transactions' chooser). Omitted: Cancel. */
  onExit?: () => void
  /** Done on the result screen: the import is saved. */
  onImported: (accountId: string) => void
}

/** rowIndex → category suggested from an earlier transaction with the same name. */
function suggestedChoices(parseResult: ParseWithProfileResult): Choices {
  return Object.fromEntries(parseResult.rows.map((row) => [row.rowIndex, row.suggestedCategoryId]))
}

/**
 * "Import transactions": account → file → categorize → review → imported.
 * A file with no new rows goes straight to the final step instead. Only accounts with CSV import on and a CSV profile can be picked; it never
 * sets up profiles or accounts itself. Nothing is written until Import, so
 * Back works on every step.
 */
export function useImportFlow({ initialEntry = null, onExit, onImported }: ImportFlowOptions) {
  const { activeCategories } = useCategories()
  const { profiles, refresh: refreshProfiles } = useImportProfiles()
  const { accounts, refresh: refreshAccounts } = useAccounts()

  const [started, setStarted] = useState(!!initialEntry)
  const [step, setStep] = useState<Step>(() => (initialEntry?.mode === 'file' ? { name: 'file', accountId: initialEntry.accountId } : { name: 'account' }))
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(() =>
    initialEntry ? (initialEntry.mode === 'file' ? initialEntry.accountId : (initialEntry.preselectAccountId ?? null)) : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'uploading' | 'reading'>(null)
  const [skippedNote, setSkippedNote] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  // Bumped on every step change, so a file read that finishes after Back doesn't pull the user forward.
  const navigation = useRef(0)

  function goTo(next: Step) {
    navigation.current += 1
    setError(null)
    setBusy(null)
    setStep(next)
  }

  async function parse(accountId: string, uploaded: UploadedFile, importProfileId: string) {
    const run = navigation.current
    setBusy('reading')
    try {
      const parseResult = await apiClient.post<ParseWithProfileResult>('/import-runs/parse', { uploadedFileId: uploaded.uploadedFileId, importProfileId })
      if (run !== navigation.current) return
      setSkippedNote(parseResult.skippedDuplicateCount > 0 ? `Skipped ${parseResult.skippedDuplicateCount} likely duplicates already in your transactions.` : null)
      if (parseResult.rows.length === 0) {
        goTo({ name: 'nothingNew', accountId, skippedDuplicateCount: parseResult.skippedDuplicateCount, ...fileOf(uploaded) })
        return
      }
      const parsed: Parsed = { accountId, parseResult, choices: suggestedChoices(parseResult), ...fileOf(uploaded) }
      // Rows whose name matches an earlier categorized transaction arrive with
      // that category; the deck only asks about the rest, then everything is reviewed.
      const allSuggested = parseResult.rows.length > 0 && parseResult.rows.every((row) => row.suggestedCategoryId)
      goTo(allSuggested ? { name: 'review', ...parsed } : { name: 'categorize', ...parsed })
    } catch (err) {
      if (run !== navigation.current) return
      setBusy(null)
      setError(err instanceof Error ? err.message : 'Failed to read the file with this profile')
    }
  }

  function start(entry: ImportEntry) {
    setStarted(true)
    setSkippedNote(null)
    // The host may have just created the account or its profile.
    void refreshAccounts()
    void refreshProfiles()
    if (entry.mode === 'file') {
      setChosenAccountId(entry.accountId)
      goTo({ name: 'file', accountId: entry.accountId })
      void parse(entry.accountId, entry.uploaded, entry.importProfileId)
    } else {
      setChosenAccountId(entry.preselectAccountId ?? null)
      goTo({ name: 'account' })
    }
  }

  const profileFor = (accountId: string) => profiles.find((p) => p.accountId === accountId) ?? null
  const accountOf = (accountId: string | null) => (accountId ? (accounts.find((a) => a.id === accountId) ?? null) : null)

  async function handleFileSelected(accountId: string, file: File) {
    const profile = profileFor(accountId)
    if (!profile) return
    setError(null)
    setBusy('uploading')
    const run = navigation.current
    try {
      const uploaded = await apiClient.upload<{ id: string }>('/import-runs/upload', file)
      if (run !== navigation.current) return
      await parse(accountId, { uploadedFileId: uploaded.id, fileName: file.name }, profile.id)
    } catch (err) {
      if (run !== navigation.current) return
      setBusy(null)
      setError(err instanceof Error ? err.message : 'Failed to upload file')
    }
  }

  async function handleCommit(parsed: Parsed) {
    setError(null)
    setCommitting(true)
    try {
      const rows = parsed.parseResult.rows.map((row) => ({ rowIndex: row.rowIndex, categoryId: parsed.choices[row.rowIndex] ?? null }))
      const result = await apiClient.post<CommitImportRunResult>('/import-runs/commit', { importRunId: parsed.parseResult.importRunId, rows })
      let warning: string | null = null
      if (result.warnings.length > 0) {
        const total = result.warnings.reduce((sum, w) => sum + w.rowCount, 0)
        const detail = result.warnings.map((w) => `${w.rowCount} in ${w.currencyCode}`).join(', ')
        warning =
          `${total} couldn’t be converted to your home currency yet (no exchange rate: ${detail}). ` +
          'Their converted values fill in automatically the next time you log in.'
      }
      goTo({ name: 'imported', accountId: parsed.accountId, importedCount: result.importedCount, warning })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit import')
    } finally {
      setCommitting(false)
    }
  }

  if (!started) return { start, view: null }

  const exitBack: WizardFooterProps['back'] = onExit ? { label: 'Back', onClick: onExit } : undefined
  const errorAlert = error && <Alert variant="error">{error}</Alert>

  let body: ReactNode
  switch (step.name) {
    case 'account':
      body = (
        <ChooseAccountStep
          accounts={accounts}
          accountIdsWithProfile={new Set(profiles.map((p) => p.accountId).filter((id): id is string => !!id))}
          selectedId={chosenAccountId}
          onSelect={setChosenAccountId}
          back={exitBack}
          onContinue={(accountId) => goTo({ name: 'file', accountId })}
        />
      )
      break

    case 'file': {
      const account = accountOf(step.accountId)
      body = (
        <WizardStep footer={{ back: { label: 'Back', onClick: () => goTo({ name: 'account' }) } }}>
          <section className="wizard-question">
            <h2>Upload a CSV export of {account?.name ?? 'this account'}</h2>
            <p className="wizard-hint">Download a recent export of its transactions from the provider’s website or app, then drop it here.</p>
            <UploadDropzone
              uploading={busy !== null}
              busyLabel={busy === 'reading' ? 'Reading your file…' : 'Uploading…'}
              onFile={(file) => handleFileSelected(step.accountId, file)}
            />
          </section>
          {errorAlert}
        </WizardStep>
      )
      break
    }

    case 'categorize': {
      const autoCount = step.parseResult.rows.filter((row) => row.suggestedCategoryId).length
      body = (
        <WizardStep footer={{ back: { label: 'Back', onClick: () => goTo({ name: 'file', accountId: step.accountId }) } }}>
          {skippedNote && <p className="wizard-hint">{skippedNote}</p>}
          {autoCount > 0 && (
            <p className="wizard-hint">
              {autoCount === 1 ? '1 transaction was' : `${autoCount} transactions were`} categorized from earlier ones with the same name. You’ll see every
              row before importing.
            </p>
          )}
          <CategorizationDeck
            rows={step.parseResult.rows.filter((row) => !row.suggestedCategoryId)}
            categories={activeCategories}
            initialChoices={step.choices}
            onDone={(categorized: CategorizedRow[]) => {
              const choices = { ...step.choices }
              for (const { rowIndex, categoryId } of categorized) choices[rowIndex] = categoryId
              goTo({ ...step, name: 'review', choices })
            }}
          />
        </WizardStep>
      )
      break
    }

    case 'review': {
      const count = step.parseResult.rows.length
      const deckWasShown = step.parseResult.rows.some((row) => !row.suggestedCategoryId)
      body = (
        <WizardStep
          onSubmit={() => handleCommit(step)}
          footer={{
            back: {
              label: 'Back',
              onClick: () => goTo(deckWasShown ? { ...step, name: 'categorize' } : { name: 'file', accountId: step.accountId }),
              disabled: committing,
            },
            primary: {
              label: committing ? 'Importing…' : `Import ${count} ${count === 1 ? 'transaction' : 'transactions'}`,
              loading: committing,
              disabled: count === 0,
            },
          }}
        >
          <h2 className="visually-hidden">Review import</h2>
          {skippedNote && <p className="wizard-hint">{skippedNote}</p>}
          <ImportReview
            rows={step.parseResult.rows}
            categories={activeCategories}
            choices={step.choices}
            onChange={(rowIndex, categoryId) => setStep({ ...step, choices: { ...step.choices, [rowIndex]: categoryId } })}
          />
          {errorAlert}
        </WizardStep>
      )
      break
    }

    case 'imported': {
      const n = step.importedCount
      body = (
        <WizardResult
          tone={step.warning ? 'warning' : 'success'}
          title={`Imported ${n} ${n === 1 ? 'transaction' : 'transactions'}`}
          message={step.warning ?? `They’re now in ${accountOf(step.accountId)?.name ?? 'this account'}. Uncategorized ones can be sorted any time from the Transactions page.`}
          onDone={() => onImported(step.accountId)}
        />
      )
      break
    }

    case 'nothingNew': {
      const accountName = accountOf(step.accountId)?.name ?? 'this account'
      const upToDate = step.skippedDuplicateCount > 0
      body = (
        <WizardResult
          tone={upToDate ? 'success' : 'warning'}
          title={upToDate ? 'Already up to date' : 'No transactions found'}
          message={
            upToDate
              ? `All ${step.skippedDuplicateCount} transactions in this file are already in ${accountName}, so there’s nothing to import.`
              : 'This file has no rows with a date and an amount. Check that it’s an export of this account, or redo its CSV setup in the account’s settings.'
          }
          onDone={() => onImported(step.accountId)}
          alternative={{ label: 'Choose another file', onClick: () => goTo({ name: 'file', accountId: step.accountId }) }}
        />
      )
      break
    }
  }

  const shownAccount = accountOf('accountId' in step ? step.accountId : null)
  const view: CsvFlowView = {
    title: 'Import transactions',
    subtitle: [shownAccount?.name, 'fileName' in step ? step.fileName : null].filter(Boolean).join(' · ') || undefined,
    steps: STEPS,
    // "Nothing new" is the final step, like a finished import.
    currentStep: step.name === 'nothingNew' ? 'imported' : step.name,
    // Nothing to lose before a file is read, or once the import is saved.
    dirty: step.name === 'categorize' || step.name === 'review',
    body,
  }
  return { start, view }
}
