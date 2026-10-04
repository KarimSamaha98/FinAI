import { useMemo, useState } from 'react'
import { useFxRates } from '../../hooks/useFxRates'
import { CURRENCY_CODES } from '../../lib/currencies'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'

interface FxRatesSectionProps {
  homeCurrencyCode: string
}

function parseRate(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function FxRatesSection({ homeCurrencyCode }: FxRatesSectionProps) {
  const { rates, currenciesInUse, loading, error, upsertRate } = useFxRates()
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingCode, setSavingCode] = useState<string | null>(null)

  // Rows for every currency that's in use (any account or transaction) OR
  // already has a saved rate — so a manually added rate stays visible even
  // before any money in that currency exists.
  const listedCodes = useMemo(() => {
    const set = new Set<string>([...currenciesInUse, ...rates.map((r) => r.baseCurrency)])
    set.delete(homeCurrencyCode)
    return [...set].sort()
  }, [currenciesInUse, rates, homeCurrencyCode])

  const addableCodes = useMemo(
    () => CURRENCY_CODES.filter((code) => code !== homeCurrencyCode && !listedCodes.includes(code)),
    [homeCurrencyCode, listedCodes],
  )

  const [addCode, setAddCode] = useState<string>('')
  const [addRate, setAddRate] = useState<string>('')
  const selectedAddCode = addableCodes.includes(addCode) ? addCode : addableCodes[0]

  function rateFor(code: string): string {
    if (drafts[code] !== undefined) return drafts[code]
    const existing = rates.find((r) => r.baseCurrency === code)
    return existing ? String(existing.rate) : ''
  }

  async function handleSave(code: string) {
    const value = parseRate(rateFor(code))
    if (value === null) return
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

  async function handleAdd() {
    if (selectedAddCode === undefined) return
    const value = parseRate(addRate)
    if (value === null) return
    setSavingCode(selectedAddCode)
    try {
      await upsertRate(selectedAddCode, homeCurrencyCode, value)
      setAddRate('')
    } finally {
      setSavingCode(null)
    }
  }

  return (
    <Card style={{ marginTop: 'var(--space-4)' }}>
      <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Exchange rates</h2>
      {error && <Alert variant="error">{error}</Alert>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading…</p>}
      {!loading && listedCodes.length === 0 && (
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          No foreign currencies yet — add a conversion below, or record an account or transaction in another currency.
        </p>
      )}
      {listedCodes.map((code) => (
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
      {addableCodes.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-end', margin: 'var(--space-3) 0 0', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border)' }}>
          <label>
            Add conversion
            <select value={selectedAddCode ?? ''} onChange={(e) => setAddCode(e.target.value)}>
              {addableCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <label>
            1 {selectedAddCode ?? ''} =
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="e.g. 1.27…"
              value={addRate}
              onChange={(e) => setAddRate(e.target.value)}
              style={{ width: '8rem' }}
            />
          </label>
          <span style={{ color: 'var(--text-muted)', paddingBottom: '0.55rem' }}>{homeCurrencyCode}</span>
          <Button
            variant="secondary"
            loading={selectedAddCode !== undefined && savingCode === selectedAddCode}
            disabled={parseRate(addRate) === null}
            onClick={handleAdd}
          >
            Save
          </Button>
        </div>
      )}
    </Card>
  )
}
