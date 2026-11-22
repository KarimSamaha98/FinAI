import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'
import { apiClient } from '../../lib/apiClient'
import { queryClient } from '../../lib/queryClient'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const syncedUserId = useRef<string | null>(null)
  const cachedUserId = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      cachedUserId.current = data.session?.user.id ?? null
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Signed out, or someone else signed in: drop every cached API read so
      // no screen ever shows the previous user's data.
      const userId = newSession?.user.id ?? null
      if (userId !== cachedUserId.current) {
        if (cachedUserId.current !== null) queryClient.clear()
        cachedUserId.current = userId
      }
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  // On login: warm the rate cache for the user's currencies and repair any
  // transactions whose conversion failed earlier. Best-effort — the home
  // screen surfaces an error if rates still can't be resolved.
  useEffect(() => {
    const userId = session?.user.id ?? null
    if (!userId || syncedUserId.current === userId) return
    syncedUserId.current = userId
    void apiClient.post('/fx/sync').catch(() => {})
  }, [session])

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>
}
