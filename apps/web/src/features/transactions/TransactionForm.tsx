import { useState, type FormEvent } from 'react'
import type { Account, Category, CreateTransactionInput } from 'shared-types'
import { CategorySelect } from '../../components/CategorySelect'
import { AccountSelect } from '../../components/AccountSelect'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { CURRENCY_OPTIONS } from '../../lib/currencies'
import { FieldSelect } from '../../components/FieldSelect'
import { FieldDatePicker } from '../../components/FieldDatePicker'
import { useProfile } from '../../hooks/useProfile'

export interface TransactionFormValues {
  date: string
  type: 'expense' | 'income'
  amount: string
  currencyCode: string
  description: string
  categoryId: string | null
  accountId: string | null
  /** Explicit currency → home rate; empty string means "use the automatic rate". */
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
    fxRateOverride: '',
  }
}

interface TransactionFormProps {
  categories: Category[]
  accounts: Account[]
  /** When set (a specific account is selected, not "ALL"), the account is fixed and not shown as a picker. */
  fixedAccountId: string | null
  initialValues?: TransactionFormValues
  onSubmit: (input: CreateTransactionInput) => Promise<void>
  onCancel: () => void
}

export function TransactionForm({ categories, accounts, fixedAccountId, initialValues, onSubmit, onCancel }: TransactionFormProps) {
  const { profile } = useProfile()
  const homeCurrency = profile?.homeCurrencyCode ?? null
  const [values, setValues] = useState<TransactionFormValues>(initialValues ?? emptyValues(fixedAccountId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setSubmitting(true)
    try {
      await onSubmit({
        date: values.date,
        amount: values.type === 'expense' ? -amount : amount,
        currencyCode: values.currencyCode,
        description: values.description,
        categoryId: values.categoryId,
        accountId: values.accountId,
        // Empty = let the API use the automatic market rate for the date.
        fxRateOverride: values.fxRateOverride.trim() === '' ? null : Number(values.fxRateOverride),
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
          <FieldSelect value={values.currencyCode} options={CURRENCY_OPTIONS} onChange={(currencyCode) => setValues({ ...values, currencyCode })} />
        </label>
      </div>
      <label>
        Description
        <input type="text" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} />
      </label>
      {homeCurrency && values.currencyCode !== homeCurrency && (
        <label>
          Exchange rate — 1 {values.currencyCode} =
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder={`auto (${homeCurrency})`}
            value={values.fxRateOverride}
            onChange={(e) => setValues({ ...values, fxRateOverride: e.target.value })}
          />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            Optional. Leave blank to use the market rate for {values.date} ({homeCurrency}).
          </span>
        </label>
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
