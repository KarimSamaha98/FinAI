import type { Profile, UpdateProfileInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { API_KEY, invalidateApi, queryClient } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const PATH = '/users/me'

export function useProfile() {
  // One cached profile, so every reader (the header avatar, Settings) updates together.
  const { data, loading, error, refresh } = useApiQuery<Profile>(PATH, { errorMessage: 'Failed to load profile' })

  async function updateProfile(input: UpdateProfileInput) {
    const before = data?.homeCurrencyCode
    const profile = await apiClient.patch<Profile>(PATH, input)
    queryClient.setQueryData([API_KEY, PATH], profile)
    // A new home currency recomputes every converted amount; the people setting changes net worth.
    if (profile.homeCurrencyCode !== before || input.countIousInNetWorth !== undefined) await invalidateApi()
  }

  async function uploadAvatar(file: File) {
    queryClient.setQueryData([API_KEY, PATH], await apiClient.upload<Profile>(`${PATH}/avatar`, file))
  }

  return { profile: data ?? null, loading, error, refresh, updateProfile, uploadAvatar }
}
