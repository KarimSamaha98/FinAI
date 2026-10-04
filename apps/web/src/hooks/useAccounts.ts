import { useCallback, useEffect, useState } from 'react'
import type { AccountSummary, CreateAccountInput, UpdateAccountInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await apiClient.get<AccountSummary[]>('/accounts'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createAccount(input: CreateAccountInput) {
    const account = await apiClient.post<AccountSummary>('/accounts', input)
    await refresh()
    return account
  }

  async function updateAccount(id: string, input: Omit<UpdateAccountInput, 'id'>) {
    await apiClient.patch<AccountSummary>(`/accounts/${id}`, input)
    await refresh()
  }

  async function deleteAccount(id: string) {
    await apiClient.delete(`/accounts/${id}`)
    await refresh()
  }

  async function uploadCardImage(id: string, file: File) {
    await apiClient.upload<AccountSummary>(`/accounts/${id}/card-image`, file)
    await refresh()
  }

  async function removeCardImage(id: string) {
    await apiClient.delete(`/accounts/${id}/card-image`)
    await refresh()
  }

  return { accounts, loading, error, refresh, createAccount, updateAccount, deleteAccount, uploadCardImage, removeCardImage }
}
