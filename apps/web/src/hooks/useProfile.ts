import { useCallback, useEffect, useState } from 'react'
import type { Profile, UpdateProfileInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'

// Several screens hold their own copy (the header avatar, Settings), so any
// change is broadcast to keep them all in step without a reload.
const PROFILE_CHANGED = 'finai:profile-changed'

function broadcast(profile: Profile) {
  window.dispatchEvent(new CustomEvent<Profile>(PROFILE_CHANGED, { detail: profile }))
}

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

  useEffect(() => {
    const onChanged = (event: Event) => setProfile((event as CustomEvent<Profile>).detail)
    window.addEventListener(PROFILE_CHANGED, onChanged)
    return () => window.removeEventListener(PROFILE_CHANGED, onChanged)
  }, [])

  async function updateProfile(input: UpdateProfileInput) {
    broadcast(await apiClient.patch<Profile>('/users/me', input))
  }

  async function uploadAvatar(file: File) {
    broadcast(await apiClient.upload<Profile>('/users/me/avatar', file))
  }

  return { profile, loading, error, refresh, updateProfile, uploadAvatar }
}
