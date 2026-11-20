import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type UrlPatch = Record<string, string | null | undefined>

/**
 * A view's settings kept in the address (?mode=…&period=…), so Back, Forward
 * and reload bring the view back exactly as it was left.
 *
 * `update` merges a patch: an empty, null or undefined value removes the key,
 * so defaults never clutter the URL. It replaces the history entry (changing a
 * filter shouldn't make Back step through every filter) and keeps the scroll
 * position. Send everything that changes together in one call: two calls in
 * the same event would each start from the same params and the last one wins.
 */
export function useUrlState(): [URLSearchParams, (patch: UrlPatch) => void] {
  const [params, setParams] = useSearchParams()
  const update = useCallback(
    (patch: UrlPatch) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key)
            else next.set(key, value)
          }
          return next
        },
        { replace: true, preventScrollReset: true },
      )
    },
    [setParams],
  )
  return [params, update]
}

/** The param when it's one of `allowed`, else the fallback (hand-edited or stale URLs). */
export function pickParam<T extends string>(params: URLSearchParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = params.get(key)
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}
