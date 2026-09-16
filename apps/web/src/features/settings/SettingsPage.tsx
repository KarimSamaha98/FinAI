import { Card } from '../../components/Card'
import { Alert } from '../../components/Alert'
import { useProfile } from '../../hooks/useProfile'
import { CURRENCY_CODES } from '../../lib/currencies'
import { FxRatesSection } from './FxRatesSection'

export function SettingsPage() {
  const { profile, loading, error, updateProfile } = useProfile()

  return (
    <main style={{ padding: 'var(--space-4) var(--space-5)', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <h1>Settings</h1>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}

      {profile && (
        <Card>
          <label>
            Home currency
            <select value={profile.homeCurrencyCode} onChange={(e) => updateProfile({ homeCurrencyCode: e.target.value })}>
              {CURRENCY_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 'var(--space-2)', marginBottom: 0 }}>
            Used for Insights totals and any amount converted across currencies.
          </p>
        </Card>
      )}

      {profile && <FxRatesSection homeCurrencyCode={profile.homeCurrencyCode} />}

      <Card style={{ marginTop: 'var(--space-4)' }}>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>Custom category management is coming soon.</p>
      </Card>
    </main>
  )
}
