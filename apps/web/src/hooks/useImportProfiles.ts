import type { CreateImportProfileInput, ImportProfile } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const EMPTY: ImportProfile[] = []

export function useImportProfiles(accountId?: string) {
  const { data, loading, error, refresh } = useApiQuery<ImportProfile[]>(`/import-profiles${accountId ? `?accountId=${accountId}` : ''}`, {
    errorMessage: 'Failed to load import profiles',
  })

  async function createProfile(input: CreateImportProfileInput) {
    const profile = await apiClient.post<ImportProfile>('/import-profiles', input)
    await invalidateApi()
    return profile
  }

  async function updateProfile(id: string, input: Partial<CreateImportProfileInput>) {
    const profile = await apiClient.patch<ImportProfile>(`/import-profiles/${id}`, input)
    await invalidateApi()
    return profile
  }

  async function deleteProfile(id: string) {
    await apiClient.delete(`/import-profiles/${id}`)
    await invalidateApi()
  }

  return { profiles: data ?? EMPTY, loading, error, refresh, createProfile, updateProfile, deleteProfile }
}
