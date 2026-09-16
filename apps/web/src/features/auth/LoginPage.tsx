import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from './useAuth'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'

type Mode = 'login' | 'signup'

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  if (!loading && session) {
    return <Navigate to="/accounts" replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
      } else {
        const { error: signUpError } = await supabase.auth.signUp({ email, password })
        if (signUpError) throw signUpError
        setConfirmationSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setError(null)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider })
    if (oauthError) setError(oauthError.message)
  }

  return (
    <div className="auth-shell">
      <Card className="auth-card">
        <span className="app-logo">FinAI</span>
        <h1 style={{ marginTop: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          {mode === 'login' ? 'Log in to see where your money went.' : 'Track every account in one place.'}
        </p>

        {confirmationSent ? (
          <Alert variant="success">Check your email to confirm your account, then log in.</Alert>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <label>
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>
            {error && <Alert variant="error">{error}</Alert>}
            <Button type="submit" variant="primary" loading={submitting}>
              {mode === 'login' ? 'Log in' : 'Sign up'}
            </Button>
          </form>
        )}

        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-4)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', padding: 0, font: 'inherit' }}
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => handleOAuth('google')}>
            Continue with Google
          </Button>
          <Button variant="secondary" onClick={() => handleOAuth('apple')}>
            Continue with Apple
          </Button>
        </div>
      </Card>
    </div>
  )
}
