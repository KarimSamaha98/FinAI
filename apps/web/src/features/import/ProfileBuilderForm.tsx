import { useEffect, useState } from 'react'
import type { AmountMapping, ColumnRef, CreateImportProfileInput, CurrencyMapping, PreviewRawRowsResult, SignConvention } from 'shared-types'
import { apiClient } from '../../lib/apiClient'
import { DATE_FORMAT_PRESETS, detectDateFormat, previewParsedDate } from './date-format-presets'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { CURRENCY_CODES } from '../../lib/currencies'

const SIMPLE_FIELD_KEYS = ['date', 'description'] as const
type SimpleFieldKey = (typeof SIMPLE_FIELD_KEYS)[number]
const CUSTOM_DATE_FORMAT = 'custom'
type AmountMode = 'single' | 'dual' | 'directional'

interface ProfileBuilderFormProps {
  accountId: string
  uploadedFileId: string
  onCreated: (input: CreateImportProfileInput) => Promise<void>
  onCancel: () => void
}

export function ProfileBuilderForm({ accountId, uploadedFileId, onCreated, onCancel }: ProfileBuilderFormProps) {
  const [name, setName] = useState('')
  const [currencyMode, setCurrencyMode] = useState<'fixed' | 'column'>('fixed')
  const [fixedCurrencyCode, setFixedCurrencyCode] = useState('USD')
  const [currencyColumn, setCurrencyColumn] = useState('')
  const [hasHeader, setHasHeader] = useState(true)
  const [delimiter, setDelimiter] = useState(',')
  const [dateFormat, setDateFormat] = useState('yyyy-MM-dd')
  const [dateFormatChoice, setDateFormatChoice] = useState('yyyy-MM-dd')
  const [columnRefs, setColumnRefs] = useState<Record<SimpleFieldKey, string>>({ date: '', description: '' })
  const [amountMode, setAmountMode] = useState<AmountMode>('single')
  const [signConvention, setSignConvention] = useState<SignConvention>('positive_is_expense')
  const [singleAmountColumn, setSingleAmountColumn] = useState('')
  const [expenseColumn, setExpenseColumn] = useState('')
  const [incomeColumn, setIncomeColumn] = useState('')
  const [directionalAmountColumn, setDirectionalAmountColumn] = useState('')
  const [directionColumn, setDirectionColumn] = useState('')
  const [inValue, setInValue] = useState('IN')
  const [outValue, setOutValue] = useState('OUT')
  const [preview, setPreview] = useState<PreviewRawRowsResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .post<PreviewRawRowsResult>('/import-profiles/preview-raw-rows', { uploadedFileId, delimiter, hasHeader, rowLimit: 5 })
      .then((result) => {
        if (!cancelled) {
          setPreview(result)
          setPreviewError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setPreviewError(err instanceof Error ? err.message : 'Failed to preview file')
      })
    return () => {
      cancelled = true
    }
  }, [uploadedFileId, delimiter, hasHeader])

  function toColumnRef(value: string): ColumnRef | null {
    if (value === '') return null
    return hasHeader ? { type: 'name', value } : { type: 'index', value: Number(value) }
  }

  /** Maps a raw column-select value (header name or index string) back to a sample cell, for detection/preview. */
  function sampleCellForRef(value: string): string | undefined {
    if (!preview || value === '') return undefined
    const index = hasHeader ? (preview.headerRow?.indexOf(value) ?? -1) : Number(value)
    if (index < 0) return undefined
    return preview.sampleRows[0]?.[index]
  }

  const columnOptions: { label: string; value: string }[] = preview
    ? hasHeader
      ? (preview.headerRow ?? []).map((label) => ({ label, value: label }))
      : (preview.sampleRows[0] ?? []).map((_, index) => ({ label: `Column ${index + 1}`, value: String(index) }))
    : []

  const dateSampleCell = sampleCellForRef(columnRefs.date)

  // Auto-detect the date format whenever the chosen date column changes.
  useEffect(() => {
    if (!dateSampleCell) return
    const detected = detectDateFormat(dateSampleCell)
    if (detected) {
      setDateFormat(detected)
      setDateFormatChoice(detected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateSampleCell])

  const datePreview = dateSampleCell ? previewParsedDate(dateSampleCell, dateFormat) : null

  function columnSelect(value: string, onChange: (value: string) => void) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select column</option>
        {columnOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  async function handleSubmit() {
    setError(null)
    const date = toColumnRef(columnRefs.date)
    const description = toColumnRef(columnRefs.description)

    let amount: AmountMapping | null = null
    if (amountMode === 'single') {
      const column = toColumnRef(singleAmountColumn)
      if (column) amount = { mode: 'single', column, signConvention }
    } else if (amountMode === 'dual') {
      const expense = toColumnRef(expenseColumn)
      const income = toColumnRef(incomeColumn)
      if (expense && income) amount = { mode: 'dual', expenseColumn: expense, incomeColumn: income }
    } else {
      const amountColumn = toColumnRef(directionalAmountColumn)
      const direction = toColumnRef(directionColumn)
      if (amountColumn && direction && inValue.trim() && outValue.trim()) {
        amount = { mode: 'directional', amountColumn, directionColumn: direction, inValue: inValue.trim(), outValue: outValue.trim() }
      }
    }

    let currency: CurrencyMapping | null = null
    if (currencyMode === 'fixed') {
      currency = { mode: 'fixed', code: fixedCurrencyCode }
    } else {
      const column = toColumnRef(currencyColumn)
      if (column) currency = { mode: 'column', column }
    }

    if (!name || !date || !description || !amount || !currency) {
      setError('Fill in the profile name and every column mapping')
      return
    }

    setSubmitting(true)
    try {
      await onCreated({
        accountId,
        name,
        hasHeader,
        delimiter,
        dateFormat,
        columnMapping: { date, description, amount, currency },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save import profile')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
      <h2>Create import profile</h2>

      <label>
        Profile name
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CIBC Checking" />
      </label>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <label>
          Delimiter
          <input type="text" maxLength={1} value={delimiter} onChange={(e) => setDelimiter(e.target.value || ',')} />
        </label>
        <label>
          <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} /> File has a header
          row
        </label>
      </div>

      {previewError && <Alert variant="error">{previewError}</Alert>}
      {preview && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            {hasHeader && preview.headerRow && (
              <thead>
                <tr>
                  {preview.headerRow.map((h, i) => (
                    <th key={i} style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {preview.sampleRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ border: '1px solid var(--border)', padding: '0.25rem' }}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label>
          Currency
          <select value={currencyMode} onChange={(e) => setCurrencyMode(e.target.value as 'fixed' | 'column')}>
            <option value="fixed">Fixed currency for every row</option>
            <option value="column">Read currency from a column (multi-currency accounts)</option>
          </select>
        </label>
        {currencyMode === 'fixed' ? (
          <select value={fixedCurrencyCode} onChange={(e) => setFixedCurrencyCode(e.target.value)}>
            {CURRENCY_CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        ) : (
          columnSelect(currencyColumn, setCurrencyColumn)
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem' }}>
        <label>
          date
          {columnSelect(columnRefs.date, (value) => setColumnRefs({ ...columnRefs, date: value }))}
        </label>
        <label>
          description
          {columnSelect(columnRefs.description, (value) => setColumnRefs({ ...columnRefs, description: value }))}
        </label>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label>
          Date format
          <select
            value={dateFormatChoice}
            onChange={(e) => {
              const value = e.target.value
              setDateFormatChoice(value)
              if (value !== CUSTOM_DATE_FORMAT) setDateFormat(value)
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
          <input type="text" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} placeholder="e.g. yyyy-MM-dd" />
        )}
        {dateSampleCell && (
          <p style={{ color: datePreview ? 'var(--text-muted)' : 'var(--danger)', fontSize: '0.85rem' }}>
            Preview: {dateSampleCell} → {datePreview ?? 'could not parse — check the format'}
          </p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <label>
          Amount layout
          <select value={amountMode} onChange={(e) => setAmountMode(e.target.value as AmountMode)}>
            <option value="single">Single amount column</option>
            <option value="dual">Separate expense/income columns</option>
            <option value="directional">Amount + direction column (e.g. Wise's IN/OUT)</option>
          </select>
        </label>

        {amountMode === 'single' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label>
              Amount column
              {columnSelect(singleAmountColumn, setSingleAmountColumn)}
            </label>
            <label>
              Positive amount means
              <select value={signConvention} onChange={(e) => setSignConvention(e.target.value as SignConvention)}>
                <option value="positive_is_expense">Expense</option>
                <option value="positive_is_income">Income</option>
              </select>
            </label>
          </div>
        )}

        {amountMode === 'dual' && (
          <div style={{ display: 'flex', gap: '1rem' }}>
            <label>
              Expense column
              {columnSelect(expenseColumn, setExpenseColumn)}
            </label>
            <label>
              Income column
              {columnSelect(incomeColumn, setIncomeColumn)}
            </label>
          </div>
        )}

        {amountMode === 'directional' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label>
                Amount column
                {columnSelect(directionalAmountColumn, setDirectionalAmountColumn)}
              </label>
              <label>
                Direction column
                {columnSelect(directionColumn, setDirectionColumn)}
              </label>
            </div>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <label>
                Value meaning "money in"
                <input type="text" value={inValue} onChange={(e) => setInValue(e.target.value)} placeholder="e.g. IN" />
              </label>
              <label>
                Value meaning "money out"
                <input type="text" value={outValue} onChange={(e) => setOutValue(e.target.value)} placeholder="e.g. OUT" />
              </label>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
              The amount column should always be positive — the direction column's value decides whether it's added or
              subtracted.
            </p>
          </div>
        )}
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
        <Button variant="primary" onClick={handleSubmit} loading={submitting}>
          Save profile
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
