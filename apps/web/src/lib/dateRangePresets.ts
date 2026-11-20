import { endOfMonth, format, startOfMonth, subMonths, subYears } from 'date-fns'
import type { DateRange } from '../components/DateRangePicker'

export type DateRangePreset = 'current-month' | 'last-month' | '3m' | '6m' | '1y' | 'custom'

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  'current-month': 'Current month',
  'last-month': 'Last month',
  '3m': 'Last 3 months',
  '6m': 'Last 6 months',
  '1y': 'Last 12 months',
  custom: 'Custom range',
}

function fmt(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function getPresetRange(preset: DateRangePreset): DateRange {
  const now = new Date()
  switch (preset) {
    case 'current-month':
      return { from: fmt(startOfMonth(now)), to: fmt(endOfMonth(now)) }
    case 'last-month': {
      const lastMonth = subMonths(now, 1)
      return { from: fmt(startOfMonth(lastMonth)), to: fmt(endOfMonth(lastMonth)) }
    }
    case '3m':
      return { from: fmt(subMonths(now, 3)), to: fmt(now) }
    case '6m':
      return { from: fmt(subMonths(now, 6)), to: fmt(now) }
    case '1y':
      return { from: fmt(subYears(now, 1)), to: fmt(now) }
    case 'custom':
      return {}
  }
}

const PRESETS = Object.keys(DATE_RANGE_PRESET_LABELS) as DateRangePreset[]

export interface RangeSelection {
  preset: DateRangePreset
  range: DateRange
}

/**
 * The range kept in the address: `?range=3m` for a preset (relative to today,
 * so it stays "Last 3 months" tomorrow), `?from=&to=` for exact dates (a custom
 * range, or a hand-off like Insights' "Show all"), nothing for the default.
 */
export function rangeFromParams(params: URLSearchParams, defaultPreset: DateRangePreset): RangeSelection {
  const named = params.get('range') as DateRangePreset | null
  if (named && named !== 'custom' && PRESETS.includes(named)) return { preset: named, range: getPresetRange(named) }
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined
  if (from || to || named === 'custom') return { preset: 'custom', range: { from, to } }
  return { preset: defaultPreset, range: getPresetRange(defaultPreset) }
}

/** The URL patch for a range selection; the inverse of rangeFromParams. */
export function rangeToParams({ preset, range }: RangeSelection, defaultPreset: DateRangePreset) {
  if (preset === 'custom') return { range: 'custom', from: range.from ?? null, to: range.to ?? null }
  return { range: preset === defaultPreset ? null : preset, from: null, to: null }
}
