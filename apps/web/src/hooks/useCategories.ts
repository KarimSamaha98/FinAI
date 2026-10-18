import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category, CategoryIconKey, CreateCategoryInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setCategories(await apiClient.get<Category[]>('/categories'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function sortByName(list: Category[]): Category[] {
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }

  async function createCategory(input: CreateCategoryInput) {
    const category = await apiClient.post<Category>('/categories', input)
    setCategories((prev) => sortByName([...prev, category]))
    return category
  }

  async function renameCategory(id: string, name: string, icon?: CategoryIconKey | null) {
    const updated = await apiClient.patch<Category>(`/categories/${id}`, icon === undefined ? { name } : { name, icon })
    setCategories((prev) => sortByName(prev.map((c) => (c.id === id ? updated : c))))
    return updated
  }

  /** Soft delete — the category leaves the pickers but stays on past transactions. */
  async function archiveCategory(id: string) {
    const updated = await apiClient.delete<Category>(`/categories/${id}`)
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)))
    return updated
  }

  /** How many transactions carry the category — for the warning before a permanent remove. */
  const getCategoryUsage = useCallback(
    (id: string) => apiClient.get<{ transactionCount: number }>(`/categories/${id}/usage`),
    [],
  )

  /** Hard delete — the category is deleted and every transaction that had it becomes Uncategorized. */
  async function removeCategory(id: string) {
    const result = await apiClient.delete<{ id: string; clearedTransactionCount: number }>(`/categories/${id}/permanent`)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    return result
  }

  // Pickers/forms use activeCategories; display surfaces use the full list so
  // archived categories still resolve their names on historical transactions.
  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories])

  return { categories, activeCategories, loading, error, refresh, createCategory, renameCategory, archiveCategory, getCategoryUsage, removeCategory }
}
