import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CreateTransactionInput, Transaction, UpdateTransactionInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import type { DateRange } from '../components/DateRangePicker'

export function useTransactions(dateRange: DateRange, categoryIds: string[], accountIds: string[] = []) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const categoryIdsKey = categoryIds.join(',')
  const accountIdsKey = accountIds.join(',')

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (dateRange.from) params.set('from', dateRange.from)
    if (dateRange.to) params.set('to', dateRange.to)
    if (categoryIdsKey) params.set('categoryIds', categoryIdsKey)
    if (accountIdsKey) params.set('accountIds', accountIdsKey)
    const search = params.toString()
    return search ? `?${search}` : ''
    // categoryIdsKey/accountIdsKey are the stable, primitive representations of their array props.
  }, [dateRange.from, dateRange.to, categoryIdsKey, accountIdsKey])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setTransactions(await apiClient.get<Transaction[]>(`/transactions${query}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createTransaction(input: CreateTransactionInput) {
    await apiClient.post<Transaction>('/transactions', input)
    await refresh()
  }

  async function updateTransaction(id: string, input: Omit<UpdateTransactionInput, 'id'>) {
    await apiClient.patch<Transaction>(`/transactions/${id}`, input)
    await refresh()
  }

  async function deleteTransaction(id: string) {
    await apiClient.delete(`/transactions/${id}`)
    await refresh()
  }

  return { transactions, loading, error, refresh, createTransaction, updateTransaction, deleteTransaction }
}
