import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react'
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

interface CalendarPanelProps {
  /** yyyy-MM-dd, or undefined when no day is chosen. */
  value: string | undefined
  /** Called with the picked day, or undefined for Clear. */
  onPick: (value: string | undefined) => void
  /** Earliest / latest pickable day (yyyy-MM-dd). */
  min?: string
  max?: string
  /** Show the Clear button (off for a required date). */
  clearable?: boolean
  label: string
  className?: string
  style?: CSSProperties
  panelRef?: Ref<HTMLDivElement>
}

/**
 * The month calendar inside every date dropdown: month navigation, a day
 * grid, and Today / Clear. Keyboard: arrows move by day/week, PageUp/PageDown
 * by month, Enter picks.
 */
export function CalendarPanel({ value, onPick, min, max, clearable = true, label, className, style, panelRef }: CalendarPanelProps) {
  const selected = value ? parseISO(value) : null
  // Mounted only while the dropdown is open, so this starts on the chosen month each time.
  const [focusDay, setFocusDay] = useState<Date>(() => selected ?? new Date())
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${format(focusDay, ISO)}"]`)?.focus()
  }, [focusDay])

  const isDisabled = (day: Date) => {
    const iso = format(day, ISO)
    return (!!min && iso < min) || (!!max && iso > max)
  }

  function pick(day: Date) {
    if (!isDisabled(day)) onPick(format(day, ISO))
  }

  function handleKey(event: KeyboardEvent) {
    const moves: Record<string, (d: Date) => Date> = {
      ArrowLeft: (d) => addDays(d, -1),
      ArrowRight: (d) => addDays(d, 1),
      ArrowUp: (d) => addDays(d, -7),
      ArrowDown: (d) => addDays(d, 7),
      PageUp: (d) => addMonths(d, -1),
      PageDown: (d) => addMonths(d, 1),
    }
    const move = moves[event.key]
    if (move) {
      event.preventDefault()
      setFocusDay(move(focusDay))
    }
  }

  const monthStart = startOfMonth(focusDay)
  const days = eachDayOfInterval({ start: startOfWeek(monthStart), end: endOfWeek(endOfMonth(monthStart)) })
  const today = new Date()

  return (
    <div
      ref={panelRef}
      className={['dropdown-panel', 'date-panel', className].filter(Boolean).join(' ')}
      style={style}
      role="dialog"
      aria-label={`${label} date`}
      // Inside a <label>, a click on the panel's padding would re-click the field and close it.
      onClick={(e) => {
        if (!(e.target as HTMLElement).closest('button')) e.preventDefault()
      }}
    >
      <div className="date-panel-head">
        <button type="button" className="date-panel-nav" aria-label="Previous month" onClick={() => setFocusDay(addMonths(focusDay, -1))}>
          ‹
        </button>
        <span className="date-panel-title" aria-live="polite">
          {format(monthStart, 'MMMM yyyy')}
        </span>
        <button type="button" className="date-panel-nav" aria-label="Next month" onClick={() => setFocusDay(addMonths(focusDay, 1))}>
          ›
        </button>
      </div>
      <div className="date-grid" role="grid" ref={gridRef} onKeyDown={handleKey}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="date-grid-weekday" role="columnheader" aria-hidden="true">
            {d}
          </span>
        ))}
        {days.map((day) => {
          const iso = format(day, ISO)
          const isSelected = !!selected && isSameDay(day, selected)
          const classes = [
            'date-grid-day',
            isSameMonth(day, monthStart) ? '' : 'is-outside',
            isSelected ? 'is-selected' : '',
            isSameDay(day, today) ? 'is-today' : '',
          ]
          return (
            <button
              key={iso}
              type="button"
              data-day={iso}
              role="gridcell"
              aria-selected={isSelected}
              aria-label={format(day, 'EEEE, MMMM d, yyyy')}
              tabIndex={isSameDay(day, focusDay) ? 0 : -1}
              disabled={isDisabled(day)}
              className={classes.filter(Boolean).join(' ')}
              onClick={() => pick(day)}
              onFocus={() => {
                if (!isSameDay(day, focusDay)) setFocusDay(day)
              }}
            >
              {format(day, 'd')}
            </button>
          )
        })}
      </div>
      <div className="dropdown-footer">
        {clearable ? (
          <button type="button" onClick={() => onPick(undefined)}>
            Clear
          </button>
        ) : (
          <span />
        )}
        <button type="button" disabled={isDisabled(today)} onClick={() => pick(today)}>
          Today
        </button>
      </div>
    </div>
  )
}
