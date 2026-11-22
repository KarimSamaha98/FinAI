import { QueryClient } from '@tanstack/react-query'

/**
 * One cache for every API read (TanStack Query), so pages open with the data
 * they last showed and refresh it in the background instead of starting from
 * a "Loading…" line.
 *
 * - staleTime: data younger than this is reused as-is (coming straight back
 *   to a page costs nothing); older data still shows at once and refetches.
 * - retry off: failures surface straight away, as before (FX_UNAVAILABLE
 *   has its own retry screen).
 * - No refetch on window focus: refreshes come from navigation and edits.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
})

/** Every API read's cache key starts with this. */
export const API_KEY = 'api'

/**
 * After a change: refetch what's on screen and mark everything else stale.
 * One edit can move balances, net worth, Insights and the ledger at once, so
 * it's simpler (and correct) to refresh all reads than to track which.
 */
export function invalidateApi(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: [API_KEY] })
}
