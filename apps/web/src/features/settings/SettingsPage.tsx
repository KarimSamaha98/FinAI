import { useMemo, useState } from 'react'
import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { Avatar } from '../../components/Avatar'
import { useProfile } from '../../hooks/useProfile'
import { CURRENCY_OPTIONS } from '../../lib/currencies'
import { FieldSelect } from '../../components/FieldSelect'
import { listCountries } from '../../lib/countries'
import { FxRatesSection } from './FxRatesSection'
import { CategoriesSection } from './CategoriesSection'

export function SettingsPage() {
  const { profile, loading, error, updateProfile, uploadAvatar } = useProfile()
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const countryOptions = useMemo(() => [{ value: '', label: 'Not set' }, ...listCountries().map((c) => ({ value: c.code, label: c.name }))], [])

  async function handlePhoto(file: File | undefined) {
    if (!file) return
    setPhotoError(null)
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Profile photo must be 5 MB or smaller')
      return
    }
    setUploading(true)
    try {
      await uploadAvatar(file)
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setUploading(false)
    }
  }

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <h1>Settings</h1>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {profile && (
        <Card style={{ marginBottom: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ margin: 0 }}>Profile</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
            <Avatar url={profile.avatarUrl} name={profile.displayName} size={72} />
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {uploading ? 'Uploading…' : profile.avatarUrl ? 'Change photo' : 'Add photo'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="visually-hidden"
                disabled={uploading}
                onChange={(e) => {
                  handlePhoto(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          {photoError && <Alert variant="error">{photoError}</Alert>}
          <label>
            Name
            <input
              type="text"
              maxLength={80}
              defaultValue={profile.displayName ?? ''}
              onBlur={(e) => {
                const displayName = e.target.value.trim() || null
                if (displayName !== profile.displayName) updateProfile({ displayName })
              }}
            />
          </label>
          <label>
            Country
            <FieldSelect value={profile.countryCode ?? ''} options={countryOptions} onChange={(code) => updateProfile({ countryCode: code || null })} />
          </label>
        </Card>
      )}

      {profile && (
        <Card>
          <label>
            Home currency
            <FieldSelect value={profile.homeCurrencyCode} options={CURRENCY_OPTIONS} onChange={(homeCurrencyCode) => updateProfile({ homeCurrencyCode })} />
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-2)', marginBottom: 0 }}>
            Used for Insights totals and any amount converted across currencies.
          </p>
        </Card>
      )}

      {profile && <FxRatesSection homeCurrencyCode={profile.homeCurrencyCode} />}

      <CategoriesSection />
    </main>
  )
}
