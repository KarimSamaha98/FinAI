import { useCallback, useEffect, useState } from 'react'
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

  async function createCategory(input: CreateCategoryInput) {
    const category = await apiClient.post<Category>('/categories', input)
    setCategories((prev) => [...prev, category].sort((a, b) => a.name.localeCompare(b.name)))
    return category
  }

  return { categories, loading, error, refresh, createCategory }
}
