import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'
import { apiClient } from '../../lib/apiClient'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const syncedUserId = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
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
