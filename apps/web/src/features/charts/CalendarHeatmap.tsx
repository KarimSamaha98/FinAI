import { useMemo, useState } from 'react'
import type { AmountKind, HeatmapDay, InsightMode } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'
import { addDays, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'

interface CalendarHeatmapProps {
  title: string
  days: HeatmapDay[]
  kind: AmountKind
  currencyCode: string
  period: string
  mode: InsightMode
  loading?: boolean
  /** Called with the date string when a day cell is clicked. */
  onSelect?: (date: string) => void
  /** The currently-selected date — highlighted with an accent ring. */
  selectedKey?: string | null
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type DayCell = { date: string; dayNum: number; day: HeatmapDay | null }

function buildMonthGrid(date: Date, daysByDate: Map<string, HeatmapDay>): DayCell[][] {
  const monthStart = startOfMonth(date)
  const monthEnd = endOfMonth(date)
  const startDay = monthStart.getDay()
  const totalDays = monthEnd.getDate()

  const weeks: DayCell[][] = []
  let currentWeek: DayCell[] = []

  for (let i = 0; i < startDay; i++) {
    currentWeek.push({ date: '', dayNum: 0, day: null })
  }

  for (let dayNum = 1; dayNum <= totalDays; dayNum++) {
    const currentDate = addDays(monthStart, dayNum - 1)
    const dateStr = format(currentDate, 'yyyy-MM-dd')
    currentWeek.push({ date: dateStr, dayNum, day: daysByDate.get(dateStr) ?? null })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ date: '', dayNum: 0, day: null })
    }
    weeks.push(currentWeek)
  }

  return weeks
}

function DayCellBlock({ cell, baseColor, maxAmount, onHover, onLeave, onClick }: { cell: DayCell; baseColor: string; maxAmount: number; onHover: (e: React.MouseEvent) => void; onLeave: () => void; onClick?: () => void }) {
  const isEmpty = cell.dayNum === 0
  const hasData = cell.day !== null
  const opacity = hasData ? Math.max(0.15, Math.sqrt(cell.day!.total / maxAmount)) : 1

  if (isEmpty) {
    return <div style={{ height: '22px' }} />
  }

  return (
    <div
      style={{
        height: '22px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        position: 'relative',
        cursor: hasData ? 'pointer' : 'default',
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onClick={hasData && onClick ? onClick : undefined}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '4px',
          background: hasData ? baseColor : 'var(--surface-raised)',
          opacity,
          transition: 'opacity var(--transition)',
        }}
      />
      <span
        style={{
          fontSize: '0.6rem',
          fontWeight: 500,
          color: 'var(--text)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {cell.dayNum}
      </span>
    </div>
  )
}

export function CalendarHeatmap({ title, days, kind, currencyCode, period, mode, loading, onSelect, selectedKey }: CalendarHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ date: string; amount: string; x: number; y: number } | null>(null)

  const maxAmount = useMemo(() => Math.max(...days.map((d) => d.total), 1), [days])

  const daysByDate = useMemo(() => {
    const map = new Map<string, HeatmapDay>()
    for (const day of days) map.set(day.date, day)
    return map
  }, [days])

  const baseColor = kind === 'expense' ? 'var(--outflow)' : 'var(--amount-positive)'

  const calendarGrid = useMemo(() => buildMonthGrid(parseISO(period + '-01'), daysByDate), [period, daysByDate])

  if (loading) {
    return (
      <div style={{ position: 'relative' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {WEEKDAYS.map((day, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{day}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} style={{ height: '40px', borderRadius: '6px', background: 'var(--surface-raised)' }} />
          ))}
        </div>
      </div>
    )
  }

  if (mode === 'yearly') {
    const year = Number(period)
    const months = Array.from({ length: 12 }, (_, i) => new Date(year, i, 1))

    return (
      <div className="insight-heatmap" style={{ position: 'relative' }}>
        <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
          {months.map((monthDate, idx) => {
            const grid = buildMonthGrid(monthDate, daysByDate)
            return (
              <div key={idx}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                  {MONTH_NAMES[idx]}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
                  {WEEKDAYS.map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: '0.55rem', color: 'var(--text-muted)' }}>{d}</div>
                  ))}
                  {grid.flatMap((week, wi) =>
                    week.map((cell, di) => (
                      <DayCellBlock
                        key={`${wi}-${di}`}
                        cell={cell}
                        baseColor={baseColor}
                        maxAmount={maxAmount}
                        onHover={(e) => {
                          if (cell.day) {
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setTooltip({ date: cell.date, amount: formatCurrency(cell.day.total, currencyCode), x: rect.left + rect.width / 2, y: rect.top - 8 })
                          }
                        }}
                        onLeave={() => setTooltip(null)}
                        onClick={() => cell.day && onSelect?.(cell.date)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {tooltip && (
          <div style={{ position: 'fixed', left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.65rem', boxShadow: 'var(--shadow-md)', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{format(parseISO(tooltip.date), 'MMM d, yyyy')}</div>
            <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tooltip.amount}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="insight-heatmap" style={{ position: 'relative' }}>
      <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 'var(--space-2)' }}>{title}</h4>
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {WEEKDAYS.map((day, i) => (
            <div key={i} style={{ textAlign: 'center', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{day}</div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {calendarGrid.map((week, weekIndex) =>
            week.map(({ date, dayNum, day }, dayIndex) => {
              const isEmpty = dayNum === 0
              const hasData = day !== null
              const opacity = hasData ? Math.max(0.15, Math.sqrt(day.total / maxAmount)) : 1

              return (
                <div
                  key={`${weekIndex}-${dayIndex}`}
                  className={`heatmap-day${hasData && onSelect && selectedKey === date ? ' is-selected' : ''}`}
                  role={hasData && onSelect ? 'button' : undefined}
                  tabIndex={hasData && onSelect ? 0 : undefined}
                  aria-pressed={hasData && onSelect && selectedKey !== undefined ? selectedKey === date : undefined}
                  aria-label={hasData && onSelect ? `${format(parseISO(date), 'MMM d')}: ${formatCurrency(day.total, currencyCode)}` : undefined}
                  onClick={hasData && onSelect ? () => onSelect(date) : undefined}
                  onKeyDown={hasData && onSelect ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(date) } } : undefined}
                  style={{ height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', position: 'relative', cursor: hasData ? 'pointer' : 'default', visibility: isEmpty ? 'hidden' : 'visible' }}
                  onMouseEnter={(e) => {
                    if (day) {
                      const rect = e.currentTarget.getBoundingClientRect()
                      setTooltip({ date, amount: formatCurrency(day.total, currencyCode), x: rect.left + rect.width / 2, y: rect.top - 8 })
                    }
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '6px', background: hasData ? baseColor : 'var(--surface-raised)', opacity, transition: 'opacity var(--transition)' }} />
                  <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text)', position: 'relative', zIndex: 1 }}>{dayNum}</span>
                </div>
              )
            })
          )}
        </div>
      </div>

      {tooltip && (
        <div style={{ position: 'fixed', left: `${tooltip.x}px`, top: `${tooltip.y}px`, transform: 'translate(-50%, -100%)', background: 'var(--surface-raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.4rem 0.65rem', boxShadow: 'var(--shadow-md)', pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{format(parseISO(tooltip.date), 'MMM d, yyyy')}</div>
          <div className="mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>{tooltip.amount}</div>
        </div>
      )}
    </div>
  )
}
