import type { Group, GroupCandidate, SaveGroupInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const NO_GROUPS: Group[] = []
const NO_CANDIDATES: GroupCandidate[] = []

/** Every group: transactions that belong together, and the people who share them. */
export function useGroups() {
  const { data, loading, error, refresh } = useApiQuery<Group[]>('/groups', { errorMessage: 'Failed to load groups' })
  return { groups: data ?? NO_GROUPS, loading, error, refresh }
}

/**
 * Transactions that can go in a group, in one currency (null: don't load
 * yet). `groupId` counts that group's own transactions as free (editing it).
 */
export function useGroupCandidates(currencyCode: string | null, groupId: string | null) {
  const params = new URLSearchParams()
  if (currencyCode) params.set('currency', currencyCode)
  if (groupId) params.set('group', groupId)
  const { data, loading, error } = useApiQuery<GroupCandidate[]>(currencyCode ? `/groups/candidates?${params}` : null, {
    errorMessage: 'Failed to load transactions',
  })
  return { candidates: data ?? NO_CANDIDATES, loading, error }
}

/** Every change can move net worth, the ledger, People and Home, so each one refreshes all reads. */
async function mutate<T>(request: Promise<T>): Promise<T> {
  const result = await request
  await invalidateApi()
  return result
}

export const groupsApi = {
  create: (input: SaveGroupInput) => mutate(apiClient.post<Group>('/groups', input)),
  /** Null when what's left is too little to be a group (it's ungrouped). */
  update: (id: string, input: SaveGroupInput) => mutate(apiClient.put<Group | null>(`/groups/${id}`, input)),
  remove: (id: string) => mutate(apiClient.delete<void>(`/groups/${id}`)),
}
