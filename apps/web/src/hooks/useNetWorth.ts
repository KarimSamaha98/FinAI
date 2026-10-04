import { useCallback, useEffect, useState } from 'react'
import type { NetWorth } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useNetWorth() {
  const [netWorth, setNetWorth] = useState<NetWorth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setNetWorth(await apiClient.get<NetWorth>('/accounts/net-worth'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load net worth')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { netWorth, loading, error, refresh }
}
