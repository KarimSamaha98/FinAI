import type { NetWorthSeries } from 'shared-types'
import type { DateRange } from '../components/DateRangePicker'
import { useApiQuery } from './useApiQuery'

export function useNetWorthSeries(dateRange: DateRange) {
  const path =
    dateRange.from && dateRange.to ? `/accounts/net-worth-series?${new URLSearchParams({ from: dateRange.from, to: dateRange.to })}` : null
  // A new range keeps the current chart on screen until the new one arrives.
  const { data, loading, updating, error, refresh } = useApiQuery<NetWorthSeries>(path, {
    keepPrevious: true,
    errorMessage: 'Failed to load net worth series',
  })
  return { series: data ?? null, loading, updating, error, refresh }
}
