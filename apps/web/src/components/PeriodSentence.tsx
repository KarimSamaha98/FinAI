import { useState } from 'react'
import { useDropdown } from '../hooks/useDropdown'
import { formatPeriod } from '../lib/period'
import type { InsightMode } from 'shared-types'

interface PeriodSentenceProps {
  mode: InsightMode
  period: string
  onModeChange: (mode: InsightMode) => void
  onPeriodChange: (period: string) => void
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ModeInlineDropdown({ mode, onChange }: { mode: InsightMode; onChange: (m: InsightMode) => void }) {
  const { open, setOpen, close, rootRef, triggerRef, panelRef } = useDropdown()
  const currentLabel = mode === 'monthly' ? 'monthly' : 'yearly'

  return (
    <span className="dropdown" ref={rootRef} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {currentLabel}
        <span className="dropdown-trigger-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={panelRef} className="dropdown-panel" role="listbox" aria-label="Report frequency">
          {(['monthly', 'yearly'] as InsightMode[]).map(m => {
            const selected = m === mode
            return (
              <button
                key={m}
                type="button"
                role="option"
                aria-selected={selected}
                className={`dropdown-item dropdown-option${selected ? ' is-selected' : ''}`}
                onClick={() => { onChange(m); close() }}
              >
                <span className="dropdown-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                {m === 'monthly' ? 'monthly' : 'yearly'}
              </button>
            )
          })}
        </div>
      )}
    </span>
  )
}

function PeriodInlineDropdown({ mode, period, onChange }: { mode: InsightMode; period: string; onChange: (p: string) => void }) {
  const { open, setOpen, close, rootRef, triggerRef, panelRef } = useDropdown()
  const [pickerYear, setPickerYear] = useState(() => mode === 'monthly' ? Number(period.slice(0, 4)) : Number(period))

  const label = formatPeriod(mode, period)
  const currentMonth = mode === 'monthly' ? Number(period.slice(5, 7)) : null
  const currentYear = mode === 'yearly' ? Number(period) : null

  return (
    <span className="dropdown" ref={rootRef} style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        <span className="dropdown-trigger-chevron" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={panelRef} className="dropdown-panel">
          {mode === 'monthly' ? (
            <div style={{ padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <button type="button" className="period-picker-arrow" onClick={() => setPickerYear(y => y - 1)} aria-label="Previous year">‹</button>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pickerYear}</span>
                <button type="button" className="period-picker-arrow" onClick={() => setPickerYear(y => y + 1)} aria-label="Next year">›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {MONTH_NAMES.map((name, i) => {
                  const monthNum = i + 1
                  const p = `${pickerYear}-${String(monthNum).padStart(2, '0')}`
                  const selected = monthNum === currentMonth && pickerYear === Number(period.slice(0, 4))
                  return (
                    <button
                      key={name}
                      type="button"
                      className="period-picker-btn"
                      data-selected={selected || undefined}
                      onClick={() => { onChange(p); close() }}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <div style={{ padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <button type="button" className="period-picker-arrow" onClick={() => setPickerYear(y => y - 12)} aria-label="Previous 12 years">‹</button>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{pickerYear} – {pickerYear + 11}</span>
                <button type="button" className="period-picker-arrow" onClick={() => setPickerYear(y => y + 12)} aria-label="Next 12 years">›</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                {Array.from({ length: 12 }, (_, i) => pickerYear + i).map(y => {
                  const selected = y === currentYear
                  return (
                    <button
                      key={y}
                      type="button"
                      className="period-picker-btn"
                      data-selected={selected || undefined}
                      onClick={() => { onChange(String(y)); close() }}
                    >
                      {y}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  )
}

export function PeriodSentence({ mode, period, onModeChange, onPeriodChange }: PeriodSentenceProps) {
  return (
    <p className="insights-period-sentence" style={{ margin: '0 0 var(--space-5) 0' }}>
      Your <ModeInlineDropdown mode={mode} onChange={onModeChange} /> report for{' '}
      <PeriodInlineDropdown mode={mode} period={period} onChange={onPeriodChange} />
    </p>
  )
}
