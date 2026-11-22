import type { AccountSummary, CreateAccountInput, UpdateAccountInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: AccountSummary[] = []

export function useAccounts() {
  const { data, loading, error, refresh } = useApiQuery<AccountSummary[]>('/accounts', { errorMessage: 'Failed to load accounts' })

  // Changes refresh every read: an account change moves balances, net worth and the ledger too.
  async function createAccount(input: CreateAccountInput) {
    const account = await apiClient.post<AccountSummary>('/accounts', input)
    await invalidateApi()
    return account
  }

  async function updateAccount(id: string, input: Omit<UpdateAccountInput, 'id'>) {
    await apiClient.patch<AccountSummary>(`/accounts/${id}`, input)
    await invalidateApi()
  }

  async function deleteAccount(id: string) {
    await apiClient.delete(`/accounts/${id}`)
    await invalidateApi()
  }

  async function uploadCardImage(id: string, file: File) {
    await apiClient.upload<AccountSummary>(`/accounts/${id}/card-image`, file)
    await invalidateApi()
  }

  async function removeCardImage(id: string) {
    await apiClient.delete(`/accounts/${id}/card-image`)
    await invalidateApi()
  }

  return { accounts: data ?? EMPTY, loading, error, refresh, createAccount, updateAccount, deleteAccount, uploadCardImage, removeCardImage }
}
