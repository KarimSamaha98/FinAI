import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Account, AmountMapping, ColumnRef, CreateImportProfileInput, CurrencyMapping, DisplayRow, PreviewRawRowsResult, SignConvention } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { CURRENCY_CODES } from '../../lib/currencies'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { DATE_FORMAT_PRESETS, detectDateFormat, previewParsedDate } from './date-format-presets'
import { CsvPreview, type ColumnAssignment } from './CsvPreview'
import { TransactionRow } from '../accounts/TransactionRow'

/** The preview shows at most this many lines of the file, header row included. */
const PREVIEW_ROW_COUNT = 6
const CUSTOM_DATE_FORMAT = 'custom'
/** Profiles read comma-separated files. */
const DELIMITER = ','

const STEPS = ['header', 'currency', 'date', 'description', 'amounts', 'save'] as const
type StepKey = (typeof STEPS)[number]
/** Upload happens before the wizard, so it counts as step 1 of the whole flow. */
const TOTAL_STEPS = STEPS.length + 1

type SignMode = SignConvention | 'directional'

interface ProfileWizardProps {
  accountId: string
  /** The account being set up — its card shows on the preview rows. */
  account: Account | null
  accountCurrency: string
  defaultName: string
  uploadedFileId: string
  onCreated: (input: CreateImportProfileInput) => Promise<void>
  onCancel: () => void
}

/** Same rules as the backend's parseAmountCell, for the live sign preview. */
function parseAmount(raw: string | undefined): number | null {
  const stripped = (raw ?? '').replace(/[^0-9.-]/g, '')
  if (!stripped) return null
  const value = Number(stripped)
  return Number.isFinite(value) ? value : null
}

/** Guess which of a direction column's values means money in vs out (e.g. Wise's IN/OUT). */
function guessDirectionValues(values: string[]): { inValue: string; outValue: string } | null {
  if (values.length !== 2) return null
  const isIn = (v: string) => /\b(in|credit|cr|deposit|incoming)\b/i.test(v)
  const isOut = (v: string) => /\b(out|debit|dr|withdrawal|outgoing)\b/i.test(v)
  const [a, b] = values
  if (isIn(a) || isOut(b)) return { inValue: a, outValue: b }
  if (isIn(b) || isOut(a)) return { inValue: b, outValue: a }
  return null
}

/**
 * Builds an import profile one question at a time. The file preview stays on
 * top throughout, labelling every column as it gets assigned; each step's
 * question sits underneath, and column questions can also be answered by
 * clicking a column in the preview.
 */
export function ProfileWizard({ accountId, account, accountCurrency, defaultName, uploadedFileId, onCreated, onCancel }: ProfileWizardProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const [hasHeader, setHasHeader] = useState<boolean | null>(null)
  const [currencyMode, setCurrencyMode] = useState<'fixed' | 'column' | null>(null)
  const [fixedCurrency, setFixedCurrency] = useState(CURRENCY_CODES.includes(accountCurrency) ? accountCurrency : 'USD')
  const [currencyCol, setCurrencyCol] = useState<number | null>(null)
  const [dateCol, setDateCol] = useState<number | null>(null)
  const [dateFormat, setDateFormat] = useState('yyyy-MM-dd')
  const [dateFormatChoice, setDateFormatChoice] = useState('yyyy-MM-dd')
  const [dateDetected, setDateDetected] = useState(false)
  const [descriptionCol, setDescriptionCol] = useState<number | null>(null)
  const [amountColumns, setAmountColumns] = useState<1 | 2 | null>(null)
  const [amountCol, setAmountCol] = useState<number | null>(null)
  const [signMode, setSignMode] = useState<SignMode | null>(null)
  const [directionCol, setDirectionCol] = useState<number | null>(null)
  const [inValue, setInValue] = useState('')
  const [outValue, setOutValue] = useState('')
  const [expenseCol, setExpenseCol] = useState<number | null>(null)
  const [incomeCol, setIncomeCol] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .post<PreviewRawRowsResult>('/import-profiles/preview-raw-rows', { uploadedFileId, delimiter: DELIMITER, hasHeader: false, rowLimit: PREVIEW_ROW_COUNT })
      .then((result) => {
        if (cancelled) return
        setRawRows(result.sampleRows)
        setPreviewError(null)
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to preview file')
      })
    return () => {
      cancelled = true
    }
  }, [uploadedFileId])

  const headerRow = hasHeader && rawRows ? (rawRows[0] ?? []) : null
  const dataRows = useMemo(() => (rawRows ? (hasHeader ? rawRows.slice(1) : rawRows) : []), [rawRows, hasHeader])
  const columnCount = rawRows ? Math.max(0, ...rawRows.map((row) => row.length)) : 0
  const columnName = (index: number) => headerRow?.[index]?.trim() || `Column ${index + 1}`
  const columnOptions = Array.from({ length: columnCount }, (_, index) => ({ value: index, label: columnName(index) }))

  const step: StepKey = STEPS[stepIndex]

  // ── Date detection: suggest a format whenever the date column changes ──
  const dateSample = dateCol !== null ? dataRows.find((row) => row[dateCol]?.trim())?.[dateCol] : undefined
  useEffect(() => {
    if (!dateSample) return
    const detected = detectDateFormat(dateSample)
    setDateDetected(!!detected)
    if (detected) {
      setDateFormat(detected)
      setDateFormatChoice(detected)
    }
  }, [dateSample])
  const parsedDateSample = dateSample ? previewParsedDate(dateSample, dateFormat) : null

  // ── Direction values: suggest IN/OUT from what's actually in the column ──
  const directionValues = useMemo(
    () => (directionCol === null ? [] : [...new Set(dataRows.map((row) => row[directionCol]?.trim()).filter((v): v is string => !!v))]),
    [dataRows, directionCol],
  )
  useEffect(() => {
    const guess = guessDirectionValues(directionValues)
    setInValue(guess?.inValue ?? '')
    setOutValue(guess?.outValue ?? '')
  }, [directionValues])

  // ── Which column, if any, the current question is waiting for ──
  let pickTarget: { label: string; pick: (index: number) => void } | null = null
  if (step === 'currency' && currencyMode === 'column') pickTarget = { label: 'Currency', pick: setCurrencyCol }
  else if (step === 'date') pickTarget = { label: 'Date', pick: setDateCol }
  else if (step === 'description') pickTarget = { label: 'Description', pick: setDescriptionCol }
  else if (step === 'amounts' && amountColumns === 1) {
    if (amountCol === null) pickTarget = { label: 'Amount', pick: setAmountCol }
    else if (signMode === 'directional' && directionCol === null) pickTarget = { label: 'Direction', pick: setDirectionCol }
  } else if (step === 'amounts' && amountColumns === 2) {
    pickTarget = expenseCol === null ? { label: 'Money out', pick: setExpenseCol } : incomeCol === null ? { label: 'Money in', pick: setIncomeCol } : null
  }

  const assignments: ColumnAssignment[] = []
  if (currencyMode === 'column' && currencyCol !== null) assignments.push({ column: currencyCol, label: 'Currency' })
  if (dateCol !== null) assignments.push({ column: dateCol, label: 'Date' })
  if (descriptionCol !== null) assignments.push({ column: descriptionCol, label: 'Description' })
  if (amountColumns === 1 && amountCol !== null) assignments.push({ column: amountCol, label: 'Amount' })
  if (amountColumns === 1 && signMode === 'directional' && directionCol !== null) assignments.push({ column: directionCol, label: 'Direction' })
  if (amountColumns === 2 && expenseCol !== null) assignments.push({ column: expenseCol, label: 'Money out' })
  if (amountColumns === 2 && incomeCol !== null) assignments.push({ column: incomeCol, label: 'Money in' })

  // ── Signed-amount preview for the first rows, so a wrong sign choice is obvious ──
  function signedAmount(row: string[]): number | null {
    if (amountColumns === 1 && amountCol !== null && signMode) {
      const value = parseAmount(row[amountCol])
      if (value === null) return null
      if (signMode === 'positive_is_expense') return -value
      if (signMode === 'positive_is_income') return value
      if (directionCol === null) return null
      const direction = row[directionCol]?.trim()
      if (direction === inValue) return Math.abs(value)
      if (direction === outValue) return -Math.abs(value)
      return null
    }
    if (amountColumns === 2 && expenseCol !== null && incomeCol !== null) {
      const expense = parseAmount(row[expenseCol])
      const income = parseAmount(row[incomeCol])
      if (expense !== null && expense !== 0) return -Math.abs(expense)
      if (income !== null) return Math.abs(income)
      return null
    }
    return null
  }
  const amountPreviewReady =
    (amountColumns === 1 && amountCol !== null && !!signMode && (signMode !== 'directional' || (directionCol !== null && !!inValue && !!outValue))) ||
    (amountColumns === 2 && expenseCol !== null && incomeCol !== null)
  const previewCurrency = (row: string[]) =>
    currencyMode === 'column' && currencyCol !== null ? (row[currencyCol]?.trim().toUpperCase() || fixedCurrency) : fixedCurrency

  // The first rows rendered exactly as they'll appear on the Transaction page.
  // Category is chosen after import, so they read "Uncategorized" for now.
  const previewTransactions: DisplayRow[] = []
  let skippedPreviewRows = 0
  for (const row of dataRows.slice(0, 3)) {
    const amount = signedAmount(row)
    const date = dateCol !== null && row[dateCol] ? previewParsedDate(row[dateCol], dateFormat) : null
    if (amount === null || !date) {
      skippedPreviewRows += 1
      continue
    }
    previewTransactions.push({
      kind: 'plain',
      date,
      amount,
      currencyCode: previewCurrency(row),
      description: (descriptionCol !== null && row[descriptionCol]?.trim()) || '',
      categoryId: null,
      accountIds: [accountId],
      sourceTransactionIds: [],
      reconciliationGroupId: null,
      monthSplitId: null,
    })
  }

  const canContinue: Record<StepKey, boolean> = {
    header: hasHeader !== null && !!rawRows,
    currency: currencyMode === 'fixed' || (currencyMode === 'column' && currencyCol !== null),
    date: dateCol !== null && !!parsedDateSample,
    description: descriptionCol !== null,
    amounts: amountPreviewReady && (signMode !== 'directional' || inValue.trim() !== outValue.trim()),
    save: true,
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
      if (dateCol === null || descriptionCol === null || hasHeader === null) throw new Error('Some steps are unanswered')
      let amount: AmountMapping
      if (amountColumns === 2 && expenseCol !== null && incomeCol !== null) {
        amount = { mode: 'dual', expenseColumn: toRef(expenseCol), incomeColumn: toRef(incomeCol) }
      } else if (amountColumns === 1 && amountCol !== null && signMode === 'directional' && directionCol !== null) {
        amount = { mode: 'directional', amountColumn: toRef(amountCol), directionColumn: toRef(directionCol), inValue: inValue.trim(), outValue: outValue.trim() }
      } else if (amountColumns === 1 && amountCol !== null && signMode && signMode !== 'directional') {
        amount = { mode: 'single', column: toRef(amountCol), signConvention: signMode }
      } else {
        throw new Error('Finish the amounts step')
      }
      const currency: CurrencyMapping =
        currencyMode === 'column' && currencyCol !== null ? { mode: 'column', column: toRef(currencyCol) } : { mode: 'fixed', code: fixedCurrency }

      setSubmitting(true)
      await onCreated({
        accountId,
        // One profile per account, so a generated name is enough to tell them apart.
        name: defaultName,
        hasHeader,
        delimiter: DELIMITER,
        dateFormat,
        columnMapping: { date: toRef(dateCol), description: toRef(descriptionCol), amount, currency },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save import profile')
    } finally {
      setSubmitting(false)
    }
  }

  /** A column assigned to one field isn't offered (or clickable) for any other. */
  const isTakenByOther = (column: number, field: string) => assignments.some((a) => a.column === column && a.label !== field)

  function columnSelect(field: string, value: number | null, onChange: (index: number) => void) {
    return (
      <select value={value ?? ''} onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}>
        <option value="" disabled>
          Choose a column
        </option>
        {columnOptions.filter((option) => !isTakenByOther(option.value, field)).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  function choice<T>(current: T | null, value: T, set: (value: T) => void, title: string, detail?: string) {
    return (
      <button type="button" className={`wizard-choice${current === value ? ' is-selected' : ''}`} aria-pressed={current === value} onClick={() => set(value)}>
        <span className="wizard-choice-title">{title}</span>
        {detail && <span className="wizard-choice-detail">{detail}</span>}
      </button>
    )
  }

  const questions: Record<StepKey, { title: string; hint?: string; body: ReactNode }> = {
    header: {
      title: 'Does the first row have column names?',
      hint: 'For example "Date", "Description", "Amount".',
      body: (
        <>
          <div className="wizard-choices">
            {choice(hasHeader, true, setHasHeader, 'Yes', 'The first row is a header')}
            {choice(hasHeader, false, setHasHeader, 'No', 'The first row is already a transaction')}
          </div>
        </>
      ),
    },
    currency: {
      title: 'How many currencies are in this file?',
      body: (
        <>
          <div className="wizard-choices">
            {choice(currencyMode, 'fixed', setCurrencyMode, 'One currency', 'Every transaction is in the same currency')}
            {choice(currencyMode, 'column', setCurrencyMode, 'More than one', 'A column says each row’s currency (e.g. Wise, Revolut)')}
          </div>
          {currencyMode === 'fixed' && (
            <label className="wizard-inline-field">
              Which currency?
              <select value={fixedCurrency} onChange={(e) => setFixedCurrency(e.target.value)}>
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          )}
          {currencyMode === 'column' && (
            <label className="wizard-inline-field">
              Which column has the currency?
              {columnSelect('Currency', currencyCol, setCurrencyCol)}
            </label>
          )}
        </>
      ),
    },
    date: {
      title: 'Which column has the date?',
      hint: 'Pick it below or click the column in the preview.',
      body: (
        <>
          <label className="wizard-inline-field">
            Date column
            {columnSelect('Date', dateCol, setDateCol)}
          </label>
          {dateSample && (
            <>
              <p className={`wizard-check${parsedDateSample ? '' : ' is-error'}`}>
                {parsedDateSample
                  ? `${dateDetected ? 'Detected format' : 'Format'}: “${dateSample}” reads as ${formatIsoForDisplay(parsedDateSample)}.`
                  : `“${dateSample}” doesn’t match this format — choose the right one below.`}
              </p>
              <label className="wizard-inline-field">
                Date format
                <select
                  value={dateFormatChoice}
                  onChange={(e) => {
                    setDateFormatChoice(e.target.value)
                    if (e.target.value !== CUSTOM_DATE_FORMAT) setDateFormat(e.target.value)
                  }}
                >
                  {DATE_FORMAT_PRESETS.map((preset) => (
                    <option key={preset.value} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                  <option value={CUSTOM_DATE_FORMAT}>Custom…</option>
                </select>
              </label>
              {dateFormatChoice === CUSTOM_DATE_FORMAT && (
                <input type="text" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} placeholder="e.g. yyyy-MM-dd" aria-label="Custom date format" />
              )}
            </>
          )}
        </>
      ),
    },
    description: {
      title: 'Which column describes the transaction?',
      hint: 'Usually the merchant or payee name.',
      body: (
        <label className="wizard-inline-field">
          Description column
          {columnSelect('Description', descriptionCol, setDescriptionCol)}
        </label>
      ),
    },
    amounts: {
      title: 'How many columns hold the amounts?',
      body: (
        <>
          <div className="wizard-choices">
            {choice(amountColumns, 1 as const, setAmountColumns, 'One column', 'Money in and out share a column')}
            {choice(amountColumns, 2 as const, setAmountColumns, 'Two columns', 'Separate columns for money out and money in')}
          </div>

          {amountColumns === 1 && (
            <>
              <label className="wizard-inline-field">
                Which column has the amounts?
                {columnSelect('Amount', amountCol, setAmountCol)}
              </label>
              {amountCol !== null && (
                <>
                  <p className="wizard-subquestion">How do you tell money in from money out?</p>
                  <div className="wizard-choices wizard-choices--three">
                    {choice(signMode, 'positive_is_expense' as SignMode, setSignMode, 'Positive is expense', 'Spending shows as a positive number')}
                    {choice(signMode, 'positive_is_income' as SignMode, setSignMode, 'Positive is income', 'Spending shows as a negative number')}
                    {choice(signMode, 'directional' as SignMode, setSignMode, 'Another column says', 'Like Wise: a column reads IN or OUT')}
                  </div>
                </>
              )}
              {signMode === 'directional' && amountCol !== null && (
                <div className="wizard-fields">
                  <label className="wizard-inline-field">
                    Which column says in or out?
                    {columnSelect('Direction', directionCol, setDirectionCol)}
                  </label>
                  {directionCol !== null && (
                    <div className="wizard-field-row">
                      <label className="wizard-inline-field">
                        Value for money in
                        <input type="text" list="direction-values" value={inValue} onChange={(e) => setInValue(e.target.value)} placeholder="e.g. IN" />
                      </label>
                      <label className="wizard-inline-field">
                        Value for money out
                        <input type="text" list="direction-values" value={outValue} onChange={(e) => setOutValue(e.target.value)} placeholder="e.g. OUT" />
                      </label>
                      <datalist id="direction-values">
                        {directionValues.map((v) => (
                          <option key={v} value={v} />
                        ))}
                      </datalist>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {amountColumns === 2 && (
            <div className="wizard-field-row">
              <label className="wizard-inline-field">
                Money out (expenses) column
                {columnSelect('Money out', expenseCol, setExpenseCol)}
              </label>
              <label className="wizard-inline-field">
                Money in (income) column
                {columnSelect('Money in', incomeCol, setIncomeCol)}
              </label>
            </div>
          )}

          {amountPreviewReady && (
            <div className="wizard-txn-preview">
              <p className="wizard-subquestion">How your transactions will look</p>
              <ul className="txn-list" aria-label="Preview of the first transactions">
                {previewTransactions.map((row, index) => (
                  <TransactionRow key={index} row={row} categories={[]} accounts={account ? [account] : []} />
                ))}
              </ul>
              {skippedPreviewRows > 0 && (
                <p className="wizard-hint">
                  {skippedPreviewRows} of the first rows {skippedPreviewRows === 1 ? 'has' : 'have'} no amount and will be skipped.
                </p>
              )}
            </div>
          )}
        </>
      ),
    },
    save: {
      title: 'Does this look right?',
      hint: 'These settings are reused every time you import a file into this account.',
      body: (
        <>
          <dl className="wizard-summary">
            <dt>Header row</dt>
            <dd>{hasHeader ? 'Yes' : 'No'}</dd>
            <dt>Currency</dt>
            <dd>{currencyMode === 'column' && currencyCol !== null ? `From “${columnName(currencyCol)}”` : fixedCurrency}</dd>
            <dt>Date</dt>
            <dd>{dateCol !== null ? `“${columnName(dateCol)}” as ${dateFormat}` : '—'}</dd>
            <dt>Description</dt>
            <dd>{descriptionCol !== null ? `“${columnName(descriptionCol)}”` : '—'}</dd>
            <dt>Amounts</dt>
            <dd>
              {amountColumns === 2 && expenseCol !== null && incomeCol !== null
                ? `Out: “${columnName(expenseCol)}”, in: “${columnName(incomeCol)}”`
                : amountCol !== null
                  ? `“${columnName(amountCol)}”, ${
                      signMode === 'positive_is_expense'
                        ? 'positive is expense'
                        : signMode === 'positive_is_income'
                          ? 'positive is income'
                          : directionCol !== null
                            ? `“${columnName(directionCol)}” says ${inValue} / ${outValue}`
                            : ''
                    }`
                  : '—'}
            </dd>
          </dl>
        </>
      ),
    },
  }

  const question = questions[step]
  const isLast = stepIndex === STEPS.length - 1

  return (
    <div className="profile-wizard">
      <div className="wizard-progress">
        <span>
          Step {stepIndex + 2} of {TOTAL_STEPS}
        </span>
        <div className="wizard-progress-bar" aria-hidden="true">
          <span style={{ width: `${((stepIndex + 2) / TOTAL_STEPS) * 100}%` }} />
        </div>
      </div>

      {previewError && <Alert variant="error">{previewError}</Alert>}
      {rawRows ? (
        <CsvPreview
          rows={rawRows}
          hasHeader={!!hasHeader}
          columnCount={columnCount}
          assignments={assignments}
          pickLabel={pickTarget?.label ?? null}
          onPickColumn={pickTarget ? pickTarget.pick : undefined}
          canPickColumn={(column) => !pickTarget || !isTakenByOther(column, pickTarget.label)}
        />
      ) : (
        !previewError && <p className="wizard-hint">Reading your file…</p>
      )}

      <section className="wizard-question" aria-live="polite">
        <h2>{question.title}</h2>
        {question.hint && <p className="wizard-hint">{question.hint}</p>}
        {question.body}
      </section>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="wizard-nav">
        <Button variant="secondary" onClick={stepIndex === 0 ? onCancel : () => setStepIndex(stepIndex - 1)}>
          {stepIndex === 0 ? 'Cancel' : 'Back'}
        </Button>
        {isLast ? (
          <Button variant="primary" onClick={handleSave} loading={submitting} disabled={!canContinue.save}>
            Save profile
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setStepIndex(stepIndex + 1)} disabled={!canContinue[step]}>
            Next
          </Button>
        )}
      </div>
    </div>
  )
}

function formatIsoForDisplay(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}
