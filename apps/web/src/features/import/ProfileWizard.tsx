import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Account, AmountMapping, ColumnRef, CreateImportProfileInput, DisplayRow, PreviewRawRowsResult } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { ChoiceCard } from '../../components/ChoiceCard'
import { WizardStep } from '../../components/WizardFooter'
import { Alert } from '../../components/Alert'
import { previewParsedDate } from './date-format-presets'
import { CsvPreview, type ColumnAssignment } from './CsvPreview'
import { PROFILE_QUESTIONS, type ProfileQuestion } from './profileQuestions'
import { TransactionRow } from '../accounts/TransactionRow'
import { TransactionList } from '../accounts/TransactionList'
import {
  detectDateFormatFor,
  detectProfile,
  distinctValues,
  exampleFor,
  parseAmount,
  suggestedExampleIsOut,
  type AmountLayout,
  type ProfileAnswers,
} from './detectProfile'

/** Lines read from the file for detection and the preview (header included). */
const SAMPLE_ROW_COUNT = 11
/** The CSV preview on column steps shows this many data rows. */
const COMPACT_ROWS = 3
/** The Preview step renders this many transactions. */
const PREVIEW_TRANSACTIONS = 5
/** Profiles read comma-separated files. */
const DELIMITER = ','

interface ProfileWizardProps {
  accountId: string
  /** The account being set up: its currency is the profile's, its card shows on the preview rows. */
  account: Account | null
  accountCurrency: string
  defaultName: string
  uploadedFileId: string
  /** Which question is showing (controlled, so the host's progress bar can show it). */
  stepIndex: number
  onStepIndexChange: (index: number) => void
  onCreated: (input: CreateImportProfileInput) => Promise<void>
  /** Back from the first question (to the sample file step). */
  onBack: () => void
}

const EMPTY_ANSWERS: ProfileAnswers = {
  hasHeader: false,
  dateCol: null,
  descriptionCol: null,
  layout: null,
  amountCol: null,
  outCol: null,
  inCol: null,
  directionCol: null,
  exampleIsOut: null,
}

type Field = 'dateCol' | 'descriptionCol' | 'amountCol' | 'outCol' | 'inCol' | 'directionCol'

const FIELD_LABELS: Record<Field, string> = {
  dateCol: 'Date',
  descriptionCol: 'Description',
  amountCol: 'Amount',
  outCol: 'Money out',
  inCol: 'Money in',
  directionCol: 'In/out',
}

const LAYOUT_CHOICES: { value: AmountLayout; title: string; detail: string }[] = [
  { value: 'single', title: 'One column, with + and −', detail: 'Money in and out share one amount column' },
  { value: 'dual', title: 'Separate money-out and money-in columns', detail: 'e.g. Debit and Credit' },
  { value: 'directional', title: 'An amount plus an in/out column', detail: 'A column says which way the money went (e.g. Wise)' },
]

/**
 * Builds an import profile in seven fixed steps, one question each, the same
 * for every file: column names, description, date, amount layout, amount
 * columns, money in/out (asked with a real row), preview. Answers are pre-filled from the file, and no input appears or
 * disappears within a step. Columns are picked by clicking them in the file's
 * preview; the date format isn't asked, it's read from the date column.
 */
export function ProfileWizard({ accountId, account, accountCurrency, defaultName, uploadedFileId, stepIndex, onStepIndexChange: setStepIndex, onCreated, onBack }: ProfileWizardProps) {
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [answers, setAnswers] = useState<ProfileAnswers>(EMPTY_ANSWERS)
  /** The field a click on the preview fills (only if it's on the current step). */
  const [activeField, setActiveField] = useState<Field | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .post<PreviewRawRowsResult>('/import-profiles/preview-raw-rows', { uploadedFileId, delimiter: DELIMITER, hasHeader: false, rowLimit: SAMPLE_ROW_COUNT })
      .then((result) => {
        if (cancelled) return
        setRawRows(result.sampleRows)
        // Pre-fill every answer the file makes obvious; the rest stay blank.
        setAnswers(detectProfile(result.sampleRows))
        setPreviewError(null)
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to preview file')
      })
    return () => {
      cancelled = true
    }
  }, [uploadedFileId])

  const step: ProfileQuestion = PROFILE_QUESTIONS[stepIndex]
  const { hasHeader, layout } = answers
  const headerRow = hasHeader && rawRows ? (rawRows[0] ?? []) : null
  const dataRows = useMemo(() => (rawRows ? (hasHeader ? rawRows.slice(1) : rawRows) : []), [rawRows, hasHeader])
  const columnCount = rawRows ? Math.max(0, ...rawRows.map((row) => row.length)) : 0
  const columnName = (index: number) => headerRow?.[index]?.trim() || `Column ${index + 1}`

  /** Changing what the money question is about clears its answer (the suggestion takes over again). */
  function update(patch: Partial<ProfileAnswers>) {
    const resetsExample = ['layout', 'amountCol', 'outCol', 'inCol', 'directionCol', 'descriptionCol', 'hasHeader'].some((key) => key in patch)
    setAnswers((current) => ({ ...current, ...patch, ...(resetsExample ? { exampleIsOut: null } : {}) }))
  }

  // ── Which fields are on which step, for preview labels and click-to-assign ──
  const amountFields: Field[] = layout === 'dual' ? ['outCol', 'inCol'] : layout === 'directional' ? ['amountCol', 'directionCol'] : ['amountCol']
  const assignedFields: Field[] = ['dateCol', 'descriptionCol', ...(layout ? amountFields : [])]
  const assignments: ColumnAssignment[] = assignedFields.flatMap((field) => (answers[field] !== null ? [{ column: answers[field]!, label: FIELD_LABELS[field] }] : []))

  /** The step's field that a click on the preview fills: the chosen one, else the first empty one. */
  const targetFor = (fields: Field[]): Field | null =>
    activeField && fields.includes(activeField) ? activeField : (fields.find((field) => answers[field] === null) ?? fields[0] ?? null)

  /**
   * The first rows of the file, labelled with the columns chosen so far (this
   * step's fields and earlier ones, never later ones). Clicking a column fills
   * the selected field; with several, the bar above the table switches between them.
   */
  function columnPicker(fields: Field[], earlier: Field[] = []) {
    if (!rawRows) return null
    const target = targetFor(fields)
    const shown = [...earlier, ...fields]
    return (
      <CsvPreview
        // Data rows only: the column names were settled on the step before, and the labels mark the columns.
        rows={dataRows.slice(0, COMPACT_ROWS)}
        hasHeader={false}
        columnCount={columnCount}
        assignments={assignments.filter((assignment) => shown.some((field) => answers[field] === assignment.column && FIELD_LABELS[field] === assignment.label))}
        pickLabel={target ? FIELD_LABELS[target] : null}
        targets={fields.length > 1 ? fields.map((field) => ({ key: field, label: FIELD_LABELS[field] })) : undefined}
        onTargetChange={(key) => setActiveField(key as Field)}
        columnName={columnName}
        onPickColumn={
          target
            ? (column) => {
                // A column used by another field of this step swaps with it; one
                // pre-filled for a later step clears that guess. (Earlier steps' columns can't be picked.)
                const patch: Partial<ProfileAnswers> = { [target]: column }
                for (const other of assignedFields) {
                  if (other === target || answers[other] !== column) continue
                  patch[other] = fields.includes(other) ? answers[target] : null
                }
                update(patch)
                // Then on to the next field still empty, if any.
                const nextEmpty = fields.find((field) => field !== target && answers[field] === null)
                if (nextEmpty) setActiveField(nextEmpty)
                else setActiveField(target)
              }
            : undefined
        }
        canPickColumn={(column) => !earlier.some((field) => answers[field] === column)}
      />
    )
  }

  // ── Date: the format is whichever one reads every date in the column ──
  const dateValues = answers.dateCol === null ? [] : dataRows.map((row) => row[answers.dateCol!]?.trim() ?? '').filter(Boolean)
  const dateFormat = detectDateFormatFor(dateValues)

  // ── Money in/out: one real row, asked about in the layout's terms ──
  const example = exampleFor(dataRows, answers, columnName)
  // With no clear suggestion, Money out is pre-selected: the user confirms it either way.
  const exampleIsOut = example ? (answers.exampleIsOut ?? suggestedExampleIsOut(dataRows, answers, example) ?? true) : null
  const directionValues = answers.directionCol === null ? [] : distinctValues(dataRows, answers.directionCol)

  /** The final amount mapping (columns as indices), or null while something's missing. */
  function amountMapping(): { mode: 'single'; col: number; positiveIsExpense: boolean } | { mode: 'dual'; out: number; in: number } | { mode: 'directional'; col: number; dir: number; inValue: string; outValue: string } | null {
    if (exampleIsOut === null || !example) return null
    if (layout === 'single' && answers.amountCol !== null) {
      const exampleValue = parseAmount(example.shown) ?? 0
      return { mode: 'single', col: answers.amountCol, positiveIsExpense: exampleIsOut === exampleValue > 0 }
    }
    if (layout === 'dual' && answers.outCol !== null && answers.inCol !== null) {
      // The example comes from the step-5 "Money out" column; "money in" means the two were the other way round.
      return exampleIsOut ? { mode: 'dual', out: answers.outCol, in: answers.inCol } : { mode: 'dual', out: answers.inCol, in: answers.outCol }
    }
    if (layout === 'directional' && answers.amountCol !== null && answers.directionCol !== null && directionValues.length === 2) {
      const other = directionValues.find((value) => value !== example.shown)!
      return {
        mode: 'directional',
        col: answers.amountCol,
        dir: answers.directionCol,
        outValue: exampleIsOut ? example.shown : other,
        inValue: exampleIsOut ? other : example.shown,
      }
    }
    return null
  }
  const mapping = amountMapping()

  function signedAmount(row: string[]): number | null {
    if (!mapping) return null
    if (mapping.mode === 'single') {
      const value = parseAmount(row[mapping.col])
      return value === null ? null : mapping.positiveIsExpense ? -value : value
    }
    if (mapping.mode === 'dual') {
      const out = parseAmount(row[mapping.out])
      const inn = parseAmount(row[mapping.in])
      if (out !== null && out !== 0) return -Math.abs(out)
      return inn !== null ? Math.abs(inn) : null
    }
    const value = parseAmount(row[mapping.col])
    const direction = row[mapping.dir]?.trim()
    if (value === null) return null
    return direction === mapping.inValue ? Math.abs(value) : direction === mapping.outValue ? -Math.abs(value) : null
  }

  // ── Rows rendered exactly as on the Transaction page ──
  function toTransaction(row: string[]): DisplayRow | null {
    const amount = signedAmount(row)
    const date = answers.dateCol !== null && dateFormat && row[answers.dateCol] ? previewParsedDate(row[answers.dateCol], dateFormat) : null
    if (amount === null || !date) return null
    return {
      kind: 'plain',
      date,
      amount,
      currencyCode: accountCurrency,
      description: (answers.descriptionCol !== null && row[answers.descriptionCol]?.trim()) || '',
      categoryId: null,
      accountIds: [accountId],
      anchorAccountId: accountId,
      sourceTransactionIds: [],
      reconciliationGroupId: null,
      monthSplitId: null,
      convertedValue: null,
      rateSource: 'auto',
      flagged: false,
      people: null,
    }
  }
  const previewTransactions = dataRows
    .map(toTransaction)
    .filter((row): row is DisplayRow => row !== null)
    .slice(0, PREVIEW_TRANSACTIONS)
  const exampleTransaction = example ? toTransaction(dataRows[example.rowIndex]) : null
  const transactionList = (rows: DisplayRow[], label: string) => (
    <TransactionList className="txn-list--inset" aria-label={label}>
      {rows.map((row, index) => (
        <TransactionRow key={index} row={row} categories={[]} accounts={account ? [account] : []} />
      ))}
    </TransactionList>
  )

  const canContinue: Record<ProfileQuestion, boolean> = {
    header: true,
    description: answers.descriptionCol !== null,
    date: answers.dateCol !== null && !!dateFormat,
    layout: layout !== null,
    amounts: amountFields.every((field) => answers[field] !== null) && (layout !== 'directional' || directionValues.length === 2),
    money: !!exampleTransaction,
    preview: !!mapping && previewTransactions.length > 0,
  }

  function toRef(index: number): ColumnRef {
    if (!hasHeader) return { type: 'index', value: index }
    const header = headerRow?.[index]?.trim()
    if (!header) throw new Error(`${columnName(index)} has no name in the header row, so it can't be matched in future files`)
    return { type: 'name', value: header }
  }

  async function handleSave() {
    setError(null)
    try {
      if (answers.dateCol === null || answers.descriptionCol === null || !dateFormat || !mapping) throw new Error('Some steps are unanswered')
      const amount: AmountMapping =
        mapping.mode === 'single'
          ? { mode: 'single', column: toRef(mapping.col), signConvention: mapping.positiveIsExpense ? 'positive_is_expense' : 'positive_is_income' }
          : mapping.mode === 'dual'
            ? { mode: 'dual', expenseColumn: toRef(mapping.out), incomeColumn: toRef(mapping.in) }
            : { mode: 'directional', amountColumn: toRef(mapping.col), directionColumn: toRef(mapping.dir), inValue: mapping.inValue, outValue: mapping.outValue }
      setSubmitting(true)
      await onCreated({
        accountId,
        // One profile per account, so a generated name is enough to tell them apart.
        name: defaultName,
        hasHeader,
        delimiter: DELIMITER,
        dateFormat,
        // Every profile reads the account's own currency (one currency per account).
        columnMapping: { date: toRef(answers.dateCol), description: toRef(answers.descriptionCol), amount, currency: { mode: 'fixed', code: accountCurrency } },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save import profile')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Each step: a question, its always-visible inputs ──
  const directionError = layout === 'directional' && answers.directionCol !== null && directionValues.length !== 2
  const questions: Record<ProfileQuestion, { title: string; hint?: string; body: ReactNode }> = {
    header: {
      title: 'Is the first row column names?',
      body: (
        <>
          {rawRows && (
            <CsvPreview
              rows={rawRows.slice(0, COMPACT_ROWS + 1)}
              hasHeader={hasHeader}
              columnCount={columnCount}
              assignments={[]}
              pickLabel={null}
              showLabels={false}
              highlightHeader
            />
          )}
          <div className="wizard-choices">
            <ChoiceCard title="Yes" detail="Like Date, Description, Amount" selected={hasHeader} onSelect={() => update({ hasHeader: true })} />
            <ChoiceCard title="No" detail="It’s already a transaction" selected={!hasHeader} onSelect={() => update({ hasHeader: false })} />
          </div>
        </>
      ),
    },
    description: {
      title: 'Which column has the description?',
      body: columnPicker(['descriptionCol']),
    },
    date: {
      title: 'Which column has the date?',
      body: (
        <>
          {columnPicker(['dateCol'], ['descriptionCol'])}
          {answers.dateCol !== null && dateValues.length > 0 && !dateFormat && (
            <Alert variant="error">The dates in {columnName(answers.dateCol)} aren’t in a format Frugal AI can read. Pick the column with the transaction date.</Alert>
          )}
        </>
      ),
    },
    layout: {
      title: 'How does the file show amounts?',
      body: (
        <>
          {/* Read-only: a look at the file before answering. */}
          {columnPicker([], ['descriptionCol', 'dateCol'])}
          <div className="wizard-choices wizard-choices--stacked">
            {LAYOUT_CHOICES.map((choice) => (
              <ChoiceCard key={choice.value} title={choice.title} detail={choice.detail} selected={layout === choice.value} onSelect={() => update({ layout: choice.value })} />
            ))}
          </div>
        </>
      ),
    },
    amounts: {
      title: layout === 'dual' ? 'Which columns have money out and money in?' : layout === 'directional' ? 'Which columns have the amount and the direction?' : 'Which column has the amount?',
      body: (
        <>
          {columnPicker(amountFields, ['descriptionCol', 'dateCol'])}
          {directionError && (
            <Alert variant="error">The In/out column should have exactly two values (like IN and OUT); this one has {directionValues.length}.</Alert>
          )}
        </>
      ),
    },
    money: {
      title: 'Is this money out or money in?',
      hint: 'A real transaction from your file, so the signs come out right.',
      body: (
        <>
          {exampleTransaction && transactionList([exampleTransaction], 'The transaction to check')}
          <div className="wizard-choices">
            <ChoiceCard title="Money out" detail="A purchase, fee or payment" selected={exampleIsOut === true} onSelect={() => setAnswers({ ...answers, exampleIsOut: true })} />
            <ChoiceCard title="Money in" detail="A refund, deposit or salary" selected={exampleIsOut === false} onSelect={() => setAnswers({ ...answers, exampleIsOut: false })} />
          </div>
        </>
      ),
    },
    preview: {
      title: 'Here’s how your transactions will look',
      hint: 'Categories are chosen when you import.',
      body: transactionList(previewTransactions, 'Preview of the first transactions'),
    },
  }

  const question = questions[step]
  const isLast = stepIndex === PROFILE_QUESTIONS.length - 1

  return (
    <WizardStep
      onSubmit={isLast ? handleSave : () => setStepIndex(stepIndex + 1)}
      footer={{
        back: { label: 'Back', onClick: stepIndex === 0 ? onBack : () => setStepIndex(stepIndex - 1) },
        primary: isLast ? { label: 'Save profile', loading: submitting, disabled: !canContinue.preview } : { label: 'Continue', disabled: !rawRows || !canContinue[step] },
      }}
    >
      {previewError && <Alert variant="error">{previewError}</Alert>}
      <section className="wizard-question" aria-live="polite">
        <h2>{question.title}</h2>
        {question.hint && <p className="wizard-hint">{question.hint}</p>}
        {rawRows ? question.body : !previewError && <p className="wizard-hint">Reading your file…</p>}
      </section>
      {error && <Alert variant="error">{error}</Alert>}
    </WizardStep>
  )
}
