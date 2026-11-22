import type { NetWorth } from 'shared-types'
import { useApiQuery } from './useApiQuery'

export function useNetWorth() {
  const { data, loading, error, refresh } = useApiQuery<NetWorth>('/accounts/net-worth', { errorMessage: 'Failed to load net worth' })
  return { netWorth: data ?? null, loading, error, refresh }
}
