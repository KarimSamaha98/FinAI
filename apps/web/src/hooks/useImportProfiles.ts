import { useCallback, useEffect, useState } from 'react'
import type { CreateImportProfileInput, ImportProfile } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useImportProfiles(accountId?: string) {
  const [profiles, setProfiles] = useState<ImportProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const query = accountId ? `?accountId=${accountId}` : ''
      setProfiles(await apiClient.get<ImportProfile[]>(`/import-profiles${query}`))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import profiles')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function createProfile(input: CreateImportProfileInput) {
    const profile = await apiClient.post<ImportProfile>('/import-profiles', input)
    await refresh()
    return profile
  }

  async function updateProfile(id: string, input: Partial<CreateImportProfileInput>) {
    const profile = await apiClient.patch<ImportProfile>(`/import-profiles/${id}`, input)
    await refresh()
    return profile
  }

  async function deleteProfile(id: string) {
    await apiClient.delete(`/import-profiles/${id}`)
    await refresh()
  }

  return { profiles, loading, error, refresh, createProfile, updateProfile, deleteProfile }
}
