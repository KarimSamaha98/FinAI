import { useState } from 'react'
import type { MonthSplit, Transaction } from 'shared-types'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { formatCurrency } from '../../lib/formatCurrency'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

interface SplitModalProps {
  open: boolean
  onClose: () => void
  transaction: Transaction
  existingSplit: MonthSplit | null
  onCreate?: (transactionId: string, startMonth: string, numMonths: number) => Promise<void>
  onUpdate: (id: string, startMonth: string, numMonths: number) => Promise<void>
}

function monthYearFromDate(date: string): { month: number; year: number } {
  const [year, month] = date.split('-').map(Number)
  return { month, year }
}

function toStartMonthString(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function addMonths(month: number, year: number, offset: number): { month: number; year: number } {
  const total = year * 12 + (month - 1) + offset
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

function monthCount(startMonth: number, startYear: number, endMonth: number, endYear: number): number {
  return endYear * 12 + (endMonth - 1) - (startYear * 12 + (startMonth - 1)) + 1
}

export function SplitModal({ open, onClose, transaction, existingSplit, onCreate, onUpdate }: SplitModalProps) {
  const transactionYear = monthYearFromDate(transaction.date).year
  const initialStart = existingSplit ? monthYearFromDate(existingSplit.startMonth) : { month: 1, year: transactionYear }
  const initialEnd = existingSplit
    ? addMonths(initialStart.month, initialStart.year, existingSplit.numMonths - 1)
    : { month: 12, year: transactionYear }

  const [startMonth, setStartMonth] = useState(initialStart.month)
  const [startYear, setStartYear] = useState(initialStart.year)
  const [endMonth, setEndMonth] = useState(initialEnd.month)
  const [endYear, setEndYear] = useState(initialEnd.year)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const years = Array.from({ length: 11 }, (_, i) => transactionYear - 5 + i)
  const count = monthCount(startMonth, startYear, endMonth, endYear)

  async function handleSubmit() {
    setError(null)
    if (count < 2 || count > 60) {
      setError(`Range must cover 2–60 months (currently ${count}).`)
      return
    }
    setSubmitting(true)
    try {
      const startMonthStr = toStartMonthString(startMonth, startYear)
      if (existingSplit) {
        await onUpdate(existingSplit.id, startMonthStr, count)
      } else if (onCreate) {
        await onCreate(transaction.id, startMonthStr, count)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save month split')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existingSplit ? 'Edit split' : 'Split transaction across months'}>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {transaction.description || 'Untitled'} · <span className="mono">{formatCurrency(transaction.amount, transaction.currencyCode)}</span>
      </p>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <label style={{ flex: 1 }}>
          Start month
          <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Start year
          <select value={startYear} onChange={(e) => setStartYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <label style={{ flex: 1 }}>
          End month
          <select value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value))}>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ flex: 1 }}>
          End year
          <select value={endYear} onChange={(e) => setEndYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        Covers {Math.max(count, 0)} months — each portion:{' '}
        <span className="mono">{formatCurrency(transaction.amount / Math.max(count, 1), transaction.currencyCode)}</span>
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSubmit} loading={submitting}>
          {existingSplit ? 'Save' : 'Split'}
        </Button>
      </div>
    </Modal>
  )
}
