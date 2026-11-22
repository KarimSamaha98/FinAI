import { useCallback, useMemo } from 'react'
import type { Category, CategoryIconKey, CreateCategoryInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { API_KEY, invalidateApi, queryClient } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const PATH = '/categories'
const KEY = [API_KEY, PATH]
const EMPTY: Category[] = []

/** The user's arrangement (Settings → Categories); name breaks ties. */
function sortByOrder(list: Category[]): Category[] {
  return [...list].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** Edits the one cached list every screen reads, so a change shows everywhere at once. */
function setCategories(update: (prev: Category[]) => Category[]) {
  queryClient.setQueryData<Category[]>(KEY, (prev) => update(prev ?? []))
}

export function useCategories() {
  const { data, loading, error, refresh } = useApiQuery<Category[]>(PATH, { errorMessage: 'Failed to load categories' })
  const categories = data ?? EMPTY

  async function createCategory(input: CreateCategoryInput) {
    const category = await apiClient.post<Category>(PATH, input)
    setCategories((prev) => sortByOrder([...prev, category]))
    return category
  }

  async function renameCategory(id: string, name: string, icon?: CategoryIconKey | null) {
    const updated = await apiClient.patch<Category>(`${PATH}/${id}`, icon === undefined ? { name } : { name, icon })
    setCategories((prev) => sortByOrder(prev.map((c) => (c.id === id ? updated : c))))
    return updated
  }

  /**
   * Saves a new arrangement. `ids` are the active categories in their new
   * order; the list updates immediately and rolls back if the save fails.
   */
  async function reorderCategories(ids: string[]) {
    const previous = queryClient.getQueryData<Category[]>(KEY)
    const position = new Map(ids.map((id, index) => [id, index + 1]))
    setCategories((prev) => sortByOrder(prev.map((c) => (position.has(c.id) ? { ...c, sortOrder: position.get(c.id)! } : c))))
    try {
      queryClient.setQueryData(KEY, await apiClient.put<Category[]>(`${PATH}/order`, { ids }))
    } catch (err) {
      queryClient.setQueryData(KEY, previous)
      throw err
    }
  }

  /** Soft delete — the category leaves the pickers but stays on past transactions. */
  async function archiveCategory(id: string) {
    const updated = await apiClient.delete<Category>(`${PATH}/${id}`)
    setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)))
    return updated
  }

  /** How many transactions carry the category — for the warning before a permanent remove. */
  const getCategoryUsage = useCallback((id: string) => apiClient.get<{ transactionCount: number }>(`${PATH}/${id}/usage`), [])

  /** Hard delete — the category is deleted and every transaction that had it becomes Uncategorized. */
  async function removeCategory(id: string) {
    const result = await apiClient.delete<{ id: string; clearedTransactionCount: number }>(`${PATH}/${id}/permanent`)
    setCategories((prev) => prev.filter((c) => c.id !== id))
    // Its transactions are Uncategorized now: the ledger and Insights change too.
    await invalidateApi()
    return result
  }

  // Pickers/forms use activeCategories; display surfaces use the full list so
  // archived categories still resolve their names on historical transactions.
  const activeCategories = useMemo(() => categories.filter((c) => !c.isArchived), [categories])

  return { categories, activeCategories, loading, error, refresh, createCategory, renameCategory, reorderCategories, archiveCategory, getCategoryUsage, removeCategory }
}
