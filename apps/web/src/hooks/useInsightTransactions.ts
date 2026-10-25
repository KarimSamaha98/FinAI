import { useEffect, useState } from 'react'
import type { DisplayRow } from 'shared-types'
import { apiClient } from '../lib/apiClient'

/**
 * Real-view rows for an Insights drill-down. Fetches only while a range is
 * given (a panel is open); callers filter the rows for the clicked item.
 */
export function useInsightTransactions(range: { from: string; to: string } | null) {
  const [state, setState] = useState<{ key: string; rows: DisplayRow[]; error: string | null } | null>(null)
  const from = range?.from
  const to = range?.to
  const key = from && to ? `${from}..${to}` : null

  useEffect(() => {
    if (!from || !to) return
    const key = `${from}..${to}`
    let cancelled = false
    const params = new URLSearchParams({ from, to, view: 'real' })
    apiClient
      .get<DisplayRow[]>(`/transactions/display?${params.toString()}`)
      .then((rows) => { if (!cancelled) setState({ key, rows, error: null }) })
      .catch((err: unknown) => {
        if (!cancelled) setState({ key, rows: [], error: err instanceof Error ? err.message : 'Failed to load transactions' })
      })
    return () => { cancelled = true }
  }, [from, to])

  const current = state && state.key === key ? state : null
  return { rows: current?.rows ?? [], loading: key !== null && current === null, error: current?.error ?? null }
}
