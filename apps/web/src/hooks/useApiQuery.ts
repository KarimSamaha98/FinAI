import { useCallback } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { API_KEY } from '../lib/queryClient'

interface ApiQueryOptions {
  /**
   * While other params load (a new filter or period), keep showing the
   * previous result instead of nothing; `updating` is true meanwhile.
   */
  keepPrevious?: boolean
  /** Shown when the error has no message of its own. */
  errorMessage?: string
}

export interface ApiQueryResult<T> {
  data: T | undefined
  /** Nothing to show yet: the first load of these params, with no earlier result. Show a placeholder. */
  loading: boolean
  /** Showing earlier data while newer data loads (a filter change, a background refresh). */
  updating: boolean
  error: string | null
  refresh: () => Promise<void>
}

/**
 * A cached GET against the API, keyed by its path (with query string). Pass
 * null to fetch nothing. Every reader of the same path shares one request
 * and one result.
 */
export function useApiQuery<T>(path: string | null, { keepPrevious = false, errorMessage = 'Failed to load' }: ApiQueryOptions = {}): ApiQueryResult<T> {
  const query = useQuery({
    queryKey: [API_KEY, path],
    queryFn: () => apiClient.get<T>(path!),
    enabled: path !== null,
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  })
  const { refetch } = query
  const refresh = useCallback(async () => {
    await refetch()
  }, [refetch])

  return {
    data: query.data,
    loading: path !== null && query.isPending,
    updating: query.isFetching && !query.isPending,
    error: query.error ? query.error.message || errorMessage : null,
    refresh,
  }
}
