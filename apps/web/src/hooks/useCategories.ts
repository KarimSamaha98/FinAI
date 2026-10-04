import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Category, CreateCategoryInput } from 'shared-types'
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

  async function renameCategory(id: string, name: string) {
    const updated = await apiClient.patch<Category>(`/categories/${id}`, { name })
    setCategories((prev) => sortByName(prev.map((c) => (c.id === id ? updated : c))))
    return updated
  }

  /** Soft delete — the category leaves the pickers but stays on past transactions. */
  async function archiveCategory(id: string) {
    const updated = await apiClient.delete<Category>(`/categories/${id}`)
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)))
    return updated
  }

  // Pickers/forms use activeCategories; display surfaces use the full list so
  // archived categories still resolve their names on historical transactions.
  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories])

  return { categories, activeCategories, loading, error, refresh, createCategory, renameCategory, archiveCategory }
}
