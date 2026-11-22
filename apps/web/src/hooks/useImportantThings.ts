import type { ImportantThingsResponse, InsightMode } from 'shared-types'
import { useApiQuery } from './useApiQuery'

const EMPTY_RESPONSE: ImportantThingsResponse = {
  categoryChanges: [],
  topExpenses: [],
  topIncome: [],
}

export function useImportantThings(mode: InsightMode, period: string) {
  const params = new URLSearchParams({ mode, period })
  const { data, loading, updating, error, refresh } = useApiQuery<ImportantThingsResponse>(`/reporting/important-things?${params}`, {
    keepPrevious: true,
    errorMessage: 'Failed to load important things',
  })
  return { ...(data ?? EMPTY_RESPONSE), loading, updating, error, refresh }
}
