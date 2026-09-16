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
