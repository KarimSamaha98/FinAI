import { useEffect, useState } from 'react'
import type { Category, Transaction } from 'shared-types'
import { apiClient } from '../lib/apiClient'

/** Ranks categories by how often the user has actually used them, for quick-tap suggestions. */
export function useTopCategories(categories: Category[], limit: number) {
  const [topCategoryIds, setTopCategoryIds] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    apiClient.get<Transaction[]>('/transactions').then((transactions) => {
      if (cancelled) return
      const counts = new Map<string, number>()
      for (const t of transactions) {
        if (!t.categoryId) continue
        counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
      setTopCategoryIds(ranked.slice(0, limit))
    })
    return () => {
      cancelled = true
    }
  }, [limit])

  const topCategories = topCategoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c !== undefined)

  return topCategories
}
