import { useCallback, useEffect, useState } from 'react'
import type { ReconciliationGroupWithComputed } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useReconciliationGroups() {
  const [groups, setGroups] = useState<ReconciliationGroupWithComputed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setGroups(await apiClient.get<ReconciliationGroupWithComputed[]>('/reconciliation-groups'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reconciliation groups')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createGroup(label: string | null, transactionIds: string[]) {
    await apiClient.post<ReconciliationGroupWithComputed>('/reconciliation-groups', { label, transactionIds })
    await refresh()
  }

  async function addMember(groupId: string, transactionId: string) {
    await apiClient.post<ReconciliationGroupWithComputed>(`/reconciliation-groups/${groupId}/members`, { transactionId })
    await refresh()
  }

  async function removeMember(groupId: string, transactionId: string) {
    await apiClient.delete(`/reconciliation-groups/${groupId}/members/${transactionId}`)
    await refresh()
  }

  async function deleteGroup(groupId: string) {
    await apiClient.delete(`/reconciliation-groups/${groupId}`)
    await refresh()
  }

  return { groups, loading, error, refresh, createGroup, addMember, removeMember, deleteGroup }
}
