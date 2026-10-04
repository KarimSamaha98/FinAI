import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { apiClient } from '../../lib/apiClient'
import { CURRENCY_CODES } from '../../lib/currencies'
import { defaultCurrencyFor, listCountries } from '../../lib/countries'
import { useAuth } from './useAuth'
import { Alert } from '../../components/Alert'

type Mode = 'login' | 'signup'

const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = 'image/png,image/jpeg,image/webp,image/gif'

interface AuthSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}

/** Pill dropdown from the Figma reference: the label doubles as the placeholder option. */
function AuthSelect({ label, value, onChange, options }: AuthSelectProps) {
  return (
    <div className="auth-select">
      <select aria-label={label} required value={value} onChange={(e) => onChange(e.target.value)} className={value ? '' : 'is-empty'}>
        <option value="" disabled>
          {label}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <img src="/dropdown-arrow.svg" alt="" aria-hidden="true" className="auth-select-arrow" />
    </div>
  )
}

function ProfilePhotoField({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  return (
    <div className="auth-photo">
      <label className="auth-photo-picker">
        <span className="auth-photo-label">Profile Picture</span>
        {previewUrl ? (
          <img src={previewUrl} alt="Your profile photo" className="auth-photo-preview" />
        ) : (
          <span className="auth-photo-hint">Tap to add a photo (optional)</span>
        )}
        <input
          type="file"
          accept={PHOTO_TYPES}
          className="visually-hidden"
          onChange={(e) => {
            onChange(e.target.files?.[0] ?? null)
            e.target.value = ''
          }}
        />
      </label>
      {file && (
        <button type="button" className="auth-photo-remove" onClick={() => onChange(null)}>
          Remove photo
        </button>
      )}
    </div>
  )
}

export function LoginPage() {
  const { session, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [currencyCode, setCurrencyCode] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmationSent, setConfirmationSent] = useState(false)

  const countryOptions = useMemo(() => listCountries().map((c) => ({ value: c.code, label: c.name })), [])
  const currencyOptions = CURRENCY_CODES.map((code) => ({ value: code, label: code }))

  // Sign-up gets a session immediately when email confirmation is off; hold the
  // redirect until the profile photo has finished uploading with it.
  if (!loading && session && !submitting) {
    return <Navigate to="/accounts" replace />
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setConfirmationSent(false)
  }

  function handleCountryChange(code: string) {
    setCountryCode(code)
    if (!currencyCode) setCurrencyCode(defaultCurrencyFor(code) ?? '')
  }

  function handlePhotoChange(file: File | null) {
    if (file && file.size > MAX_PHOTO_BYTES) {
      setError('Profile photo must be 5 MB or smaller')
      return
    }
    setError(null)
    setPhoto(file)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) throw signInError
        return
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        // Copied into the profiles row by the handle_new_user trigger.
        options: { data: { display_name: name.trim(), country_code: countryCode, home_currency_code: currencyCode } },
      })
      if (signUpError) throw signUpError
      if (!data.session) {
        setConfirmationSent(true)
        return
      }
      if (photo) {
        try {
          await apiClient.upload('/users/me/avatar', photo)
        } catch {
          // The account exists either way — the photo can be added again from Settings.
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="auth-shell">
      <div className={`auth-panel${isSignup ? ' auth-panel-wide' : ''}`}>
        <h1 className="auth-title">{isSignup ? 'Welcome to Fin.AI' : 'Welcome Back'}</h1>
        <h2 className="auth-subtitle">{isSignup ? 'Create your account' : 'Login'}</h2>

        {confirmationSent ? (
          <Alert variant="success">
            Check your email to confirm your account, then log in.
            {photo && ' You can add your profile photo from Settings once you’re in.'}
          </Alert>
        ) : (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-fields">
              {isSignup && <ProfilePhotoField file={photo} onChange={handlePhotoChange} />}
              {isSignup && (
                <input
                  className="auth-input"
                  aria-label="Name"
                  placeholder="Name"
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              )}
              <input
                className="auth-input"
                type="email"
                aria-label="Email"
                placeholder="Email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <input
                className="auth-input"
                type="password"
                aria-label="Password"
                placeholder="Password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />
              {isSignup && <AuthSelect label="Country" value={countryCode} onChange={handleCountryChange} options={countryOptions} />}
              {isSignup && <AuthSelect label="Currency" value={currencyCode} onChange={setCurrencyCode} options={currencyOptions} />}
            </div>
            {error && <Alert variant="error">{error}</Alert>}
            <button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Working…' : isSignup ? 'Sign Up' : 'Submit'}
            </button>
          </form>
        )}

        <button type="button" className="auth-switch" onClick={() => switchMode(isSignup ? 'login' : 'signup')}>
          {isSignup ? 'Login' : 'Signup'}
        </button>
      </div>
    </div>
  )
}
