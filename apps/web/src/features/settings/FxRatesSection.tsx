import { useState } from 'react'
import { useFxRates } from '../../hooks/useFxRates'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'

interface FxRatesSectionProps {
  homeCurrencyCode: string
}

export function FxRatesSection({ homeCurrencyCode }: FxRatesSectionProps) {
  const { rates, currenciesInUse, loading, error, upsertRate } = useFxRates()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingCode, setSavingCode] = useState<string | null>(null)

  function rateFor(code: string): string {
    if (drafts[code] !== undefined) return drafts[code]
    const existing = rates.find((r) => r.baseCurrency === code)
    return existing ? String(existing.rate) : ''
  }

  async function handleSave(code: string) {
    const value = Number(rateFor(code))
    if (!Number.isFinite(value) || value <= 0) return
    setSavingCode(code)
    try {
      await upsertRate(code, homeCurrencyCode, value)
      setDrafts((prev) => {
        const next = { ...prev }
        delete next[code]
        return next
      })
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <Card style={{ marginTop: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Exchange rates</h2>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && currenciesInUse.length === 0 && (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>No foreign-currency transactions yet — rates will appear here once you record one.</p>
      )}
      {currenciesInUse.map((code) => (
        <div key={code} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', margin: 'var(--space-2) 0' }}>
          <label>
            1 {code} =
            <input
              type="number"
              step="0.0001"
              min="0"
              value={rateFor(code)}
              onChange={(e) => setDrafts((prev) => ({ ...prev, [code]: e.target.value }))}
              style={{ width: '8rem' }}
            />
          </label>
          <span style={{ color: 'var(--text-muted)', paddingBottom: '0.55rem' }}>{homeCurrencyCode}</span>
          <Button variant="secondary" loading={savingCode === code} onClick={() => handleSave(code)}>
            Save
          </Button>
        </div>
      ))}
    </Card>
  )
}
