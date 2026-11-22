import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from 'shared-types'
import type { DateRange } from '../components/DateRangePicker'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: Transaction[] = []

export function useTransactions(dateRange: DateRange, categoryIds: string[], accountIds: string[] = []) {
  const params = new URLSearchParams()
  if (dateRange.from) params.set('from', dateRange.from)
  if (dateRange.to) params.set('to', dateRange.to)
  if (categoryIds.length) params.set('categoryIds', categoryIds.join(','))
  if (accountIds.length) params.set('accountIds', accountIds.join(','))
  const search = params.toString()
  const { data, loading, error, refresh } = useApiQuery<Transaction[]>(`/transactions${search ? `?${search}` : ''}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load transactions',
  })

  // Changes refresh every read: a transaction moves balances, net worth and Insights too.
  async function createTransaction(input: CreateTransactionInput) {
    await apiClient.post<Transaction>('/transactions', input)
    await invalidateApi()
  }

  async function updateTransaction(id: string, input: Omit<UpdateTransactionInput, 'id'>) {
    await apiClient.patch<Transaction>(`/transactions/${id}`, input)
    await invalidateApi()
  }

  async function deleteTransaction(id: string) {
    await apiClient.delete(`/transactions/${id}`)
    await invalidateApi()
  }

  return { transactions: data ?? EMPTY, loading, error, refresh, createTransaction, updateTransaction, deleteTransaction }
}
