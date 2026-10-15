import { useState, type FormEvent } from 'react'
import type { Account, Category, CreateTransactionInput } from 'shared-types'
import { CategorySelect } from '../../components/CategorySelect'
import { AccountSelect } from '../../components/AccountSelect'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { FieldSelect } from '../../components/FieldSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { SegmentedControl } from '../../components/SegmentedControl'
import { useProfile } from '../../hooks/useProfile'
import { useCurrencies } from '../../hooks/useCurrencies'
import { useFxRate } from '../../hooks/useFxRate'

export interface TransactionFormValues {
  date: string
  type: 'expense' | 'income'
  amount: string
  currencyCode: string
  description: string
  categoryId: string | null
  accountId: string | null
  /** How the currency → home rate is chosen (only editable when overriding is allowed). */
  fxMode: 'auto' | 'manual'
  /** Manual currency → home rate; only meaningful when fxMode is 'manual'. */
  fxRateOverride: string
}

function emptyValues(fixedAccountId: string | null): TransactionFormValues {
  return {
    date: new Date().toISOString().slice(0, 10),
    type: 'expense',
    amount: '',
    currencyCode: 'USD',
    description: '',
    categoryId: null,
    accountId: fixedAccountId,
    fxMode: 'auto',
    fxRateOverride: '',
  }
}

/** The stored precision is numeric(18,8); round to it so the field shows clean digits. */
function formatRate(rate: number): string {
  return Number(rate.toFixed(8)).toString()
}

interface TransactionFormProps {
  categories: Category[]
  accounts: Account[]
  /** When set (a specific account is selected, not "ALL"), the account is fixed and not shown as a picker. */
  fixedAccountId: string | null
  initialValues?: TransactionFormValues
  /** Show the Auto/Manual exchange-rate override — only on editing an existing transaction. */
  allowFxOverride?: boolean
  onSubmit: (input: CreateTransactionInput) => Promise<void>
  onCancel: () => void
}

export function TransactionForm({
  categories,
  accounts,
  fixedAccountId,
  initialValues,
  allowFxOverride = false,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const { profile } = useProfile()
  const { options: currencyOptions } = useCurrencies()
  const homeCurrency = profile?.homeCurrencyCode ?? null
  const [values, setValues] = useState<TransactionFormValues>(initialValues ?? emptyValues(fixedAccountId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const foreign = !!homeCurrency && values.currencyCode !== homeCurrency
  const showFx = allowFxOverride && foreign
  const { rate: autoRate, loading: rateLoading } = useFxRate(
    showFx ? values.currencyCode : null,
    showFx ? homeCurrency : null,
    showFx ? values.date : null,
  )

  function handleModeChange(mode: 'auto' | 'manual') {
    // Entering Manual: seed the field with the current market rate (or keep what's typed).
    const seed = mode === 'manual' && values.fxRateOverride.trim() === '' && autoRate != null ? formatRate(autoRate) : values.fxRateOverride
    setValues({ ...values, fxMode: mode, fxRateOverride: seed })
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const amount = Number(values.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a positive amount')
      return
    }
    if (!values.accountId) {
      setError('Choose an account')
      return
    }
    let fxRateOverride: number | null = null
    if (showFx && values.fxMode === 'manual') {
      const parsed = Number(values.fxRateOverride)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError('Enter a valid exchange rate')
        return
      }
      fxRateOverride = parsed
    }
    setSubmitting(true)
    try {
      await onSubmit({
        date: values.date,
        amount: values.type === 'expense' ? -amount : amount,
        currencyCode: values.currencyCode,
        description: values.description,
        categoryId: values.categoryId,
        accountId: values.accountId,
        // null = let the API use the automatic market rate for the date.
        fxRateOverride,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save transaction')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {!fixedAccountId && (
        <label>
          Account
          <AccountSelect accounts={accounts} value={values.accountId} onChange={(accountId) => setValues({ ...values, accountId })} />
        </label>
      )}
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <label style={{ flex: 1 }}>
          Date
          <FieldDatePicker required value={values.date} onChange={(date) => setValues({ ...values, date })} />
        </label>
        <label style={{ flex: 1 }}>
          Type
          <FieldSelect
            value={values.type}
            options={[
              { value: 'expense', label: 'Expense' },
              { value: 'income', label: 'Income' },
            ]}
            onChange={(type) => setValues({ ...values, type })}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <label style={{ flex: 2 }}>
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={values.amount}
            onChange={(e) => setValues({ ...values, amount: e.target.value })}
          />
        </label>
        <label style={{ flex: 1 }}>
          Currency
          <FieldSelect value={values.currencyCode} options={currencyOptions} onChange={(currencyCode) => setValues({ ...values, currencyCode })} />
        </label>
      </div>
      <label>
        Description
        <input type="text" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      </label>
      {showFx && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Exchange rate</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <input
              className="fx-rate-input"
              type="number"
              step="any"
              min="0"
              disabled={values.fxMode === 'auto'}
              placeholder={values.fxMode === 'auto' ? (rateLoading ? '…' : 'N/A') : 'rate'}
              value={values.fxMode === 'auto' ? (autoRate != null ? formatRate(autoRate) : '') : values.fxRateOverride}
              onChange={(e) => setValues({ ...values, fxRateOverride: e.target.value })}
              style={{ flex: 1 }}
            />
            <SegmentedControl
              value={values.fxMode}
              ariaLabel="Exchange rate mode"
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'manual', label: 'Manual' },
              ]}
              onChange={handleModeChange}
            />
          </div>
        </div>
      )}
      <label>
        Category
        <CategorySelect categories={categories} value={values.categoryId} onChange={(categoryId) => setValues({ ...values, categoryId })} />
      </label>
      {error && <Alert variant="error">{error}</Alert>}
      <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'flex-end' }}>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          Save
        </Button>
      </div>
    </form>
  )
}
