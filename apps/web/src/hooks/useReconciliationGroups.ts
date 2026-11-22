import type { ReconciliationGroupWithComputed } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: ReconciliationGroupWithComputed[] = []

export function useReconciliationGroups() {
  const { data, loading, error, refresh } = useApiQuery<ReconciliationGroupWithComputed[]>('/reconciliation-groups', {
    errorMessage: 'Failed to load reconciliation groups',
  })

  async function createGroup(label: string | null, transactionIds: string[]) {
    await apiClient.post<ReconciliationGroupWithComputed>('/reconciliation-groups', { label, transactionIds })
    await invalidateApi()
  }

  async function addMember(groupId: string, transactionId: string) {
    await apiClient.post<ReconciliationGroupWithComputed>(`/reconciliation-groups/${groupId}/members`, { transactionId })
    await invalidateApi()
  }

  async function removeMember(groupId: string, transactionId: string) {
    await apiClient.delete(`/reconciliation-groups/${groupId}/members/${transactionId}`)
    await invalidateApi()
  }

  async function deleteGroup(groupId: string) {
    await apiClient.delete(`/reconciliation-groups/${groupId}`)
    await invalidateApi()
  }

  return { groups: data ?? EMPTY, loading, error, refresh, createGroup, addMember, removeMember, deleteGroup }
}
