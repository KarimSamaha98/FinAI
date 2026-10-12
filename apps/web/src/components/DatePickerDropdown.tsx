import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
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
import { useDropdown } from '../hooks/useDropdown'

interface DatePickerDropdownProps {
  label: string
  /** yyyy-MM-dd, or undefined for "Any". */
  value: string | undefined
  onChange: (value: string | undefined) => void
  /** Earliest / latest pickable day (yyyy-MM-dd), e.g. "To" can't be before "From". */
  min?: string
  max?: string
}

const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

/**
 * A date field in the filter-bar dropdown style: the trigger reads
 * "From: Oct 1, 2026" (or "Any"), and opens a month calendar with Today and
 * Clear. Keyboard: arrows move by day/week, PageUp/PageDown by month,
 * Enter picks, Escape closes.
 */
export function DatePickerDropdown({ label, value, onChange, min, max }: DatePickerDropdownProps) {
  const { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef } = useDropdown()
  const selected = value ? parseISO(value) : null
  const [focusDay, setFocusDay] = useState<Date>(selected ?? new Date())
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setFocusDay(selected ?? new Date())
    // Reset the visible month only when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${format(focusDay, ISO)}"]`)?.focus()
  }, [open, focusDay])

  const isDisabled = (day: Date) => {
    const iso = format(day, ISO)
    return (!!min && iso < min) || (!!max && iso > max)
  }

  function pick(day: Date) {
    if (isDisabled(day)) return
    onChange(format(day, ISO))
    close()
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
    <div className="dropdown" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}: {selected ? format(selected, 'MMM d, yyyy') : 'Any'}
        <span className="dropdown-trigger-chevron" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div ref={panelRef} className={`dropdown-panel date-panel${alignEnd ? ' is-align-end' : ''}`} role="dialog" aria-label={`${label} date`}>
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
            <button
              type="button"
              onClick={() => {
                onChange(undefined)
                close()
              }}
            >
              Clear
            </button>
            <button type="button" disabled={isDisabled(today)} onClick={() => pick(today)}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
