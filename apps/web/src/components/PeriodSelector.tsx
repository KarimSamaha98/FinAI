import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { InsightMode } from 'shared-types'
import { formatPeriod, shiftPeriod } from '../lib/period'

interface PeriodSelectorProps {
  mode: InsightMode
  period: string
  onChange: (period: string) => void
}

export function PeriodSelector({ mode, period, onChange }: PeriodSelectorProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onChange(shiftPeriod(mode, period, -1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onChange(shiftPeriod(mode, period, 1))
      }
    },
    [mode, period, onChange],
  )

  return (
    <div style={{ position: 'relative' }} onKeyDown={handleKey}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          padding: '0.5rem 1rem',
          font: 'inherit',
          fontSize: '0.95rem',
          fontWeight: 700,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface)',
          color: 'var(--text)',
          cursor: 'pointer',
          minWidth: '10rem',
          textAlign: 'center',
          transition: 'border-color var(--transition)',
        }}
      >
        {formatPeriod(mode, period)}
        <span style={{ marginLeft: '0.4rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>▾</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'absolute',
            zIndex: 20,
            top: 'calc(100% + 0.4rem)',
            left: 0,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            padding: '0.75rem',
            minWidth: '12rem',
          }}
        >
          {mode === 'monthly' ? (
            <MonthlyPicker period={period} onPick={(p) => { onChange(p); setOpen(false) }} />
          ) : (
            <YearlyPicker period={period} onPick={(p) => { onChange(p); setOpen(false) }} />
          )}
        </div>
      )}
    </div>
  )
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function MonthlyPicker({ period, onPick }: { period: string; onPick: (p: string) => void }) {
  const [year, setYear] = useState(() => Number(period.slice(0, 4)))
  const currentMonth = Number(period.slice(5, 7))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button type="button" onClick={() => setYear((y) => y - 1)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{year}</span>
        <button type="button" onClick={() => setYear((y) => y + 1)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
        {MONTH_NAMES.map((name, i) => {
          const monthNum = i + 1
          const p = `${year}-${String(monthNum).padStart(2, '0')}`
          const active = monthNum === currentMonth && year === Number(period.slice(0, 4))
          return (
            <button
              key={name}
              type="button"
              onClick={() => onPick(p)}
              style={{
                padding: '0.4rem',
                border: active ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text)',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: '0.82rem',
                fontWeight: active ? 700 : 500,
                transition: 'background var(--transition)',
              }}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function YearlyPicker({ period, onPick }: { period: string; onPick: (p: string) => void }) {
  const currentYear = Number(period)
  const [baseYear, setBaseYear] = useState(() => currentYear - 4)

  const years = Array.from({ length: 12 }, (_, i) => baseYear + i)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <button type="button" onClick={() => setBaseYear((y) => y - 12)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{baseYear} – {baseYear + 11}</span>
        <button type="button" onClick={() => setBaseYear((y) => y + 12)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1rem' }}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.25rem' }}>
        {years.map((y) => {
          const active = y === currentYear
          return (
            <button
              key={y}
              type="button"
              onClick={() => onPick(String(y))}
              style={{
                padding: '0.4rem',
                border: active ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text)',
                cursor: 'pointer',
                font: 'inherit',
                fontSize: '0.82rem',
                fontWeight: active ? 700 : 500,
                transition: 'background var(--transition)',
              }}
            >
              {y}
            </button>
          )
        })}
      </div>
    </div>
  )
}
