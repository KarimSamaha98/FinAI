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

  /** The user's arrangement (Settings → Categories); name breaks ties. */
  function sortByOrder(list: Category[]): Category[] {
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  }

  async function createCategory(input: CreateCategoryInput) {
    const category = await apiClient.post<Category>('/categories', input)
    setCategories((prev) => sortByOrder([...prev, category]))
    return category
  }

  async function renameCategory(id: string, name: string, icon?: CategoryIconKey | null) {
    const updated = await apiClient.patch<Category>(`/categories/${id}`, icon === undefined ? { name } : { name, icon })
    setCategories((prev) => sortByOrder(prev.map((c) => (c.id === id ? updated : c))))
    return updated
  }

  /**
   * Saves a new arrangement. `ids` are the active categories in their new
   * order; the list updates immediately and rolls back if the save fails.
   */
  async function reorderCategories(ids: string[]) {
    const previous = categories
    const position = new Map(ids.map((id, index) => [id, index + 1]))
    setCategories((prev) => sortByOrder(prev.map((c) => (position.has(c.id) ? { ...c, sortOrder: position.get(c.id)! } : c))))
    try {
      setCategories(await apiClient.put<Category[]>('/categories/order', { ids }))
    } catch (err) {
      setCategories(previous)
      throw err
    }
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

  return { categories, activeCategories, loading, error, refresh, createCategory, renameCategory, reorderCategories, archiveCategory, getCategoryUsage, removeCategory }
}
