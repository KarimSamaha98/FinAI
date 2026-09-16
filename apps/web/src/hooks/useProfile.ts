import { useCallback, useEffect, useState } from 'react'
import type { Profile, UpdateProfileInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'

export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProfile(await apiClient.get<Profile>('/users/me'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function updateProfile(input: UpdateProfileInput) {
    setProfile(await apiClient.patch<Profile>('/users/me', input))
  }

  return { profile, loading, error, refresh, updateProfile }
}
