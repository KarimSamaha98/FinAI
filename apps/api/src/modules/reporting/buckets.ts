import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfYear,
  subMonths,
  subYears,
} from 'date-fns'
import type { BucketGranularity, InsightMode } from 'shared-types'

export interface Bucket {
  key: string
  start: Date
  end: Date
  label: string
}

export function resolveGranularity(from: string, to: string): BucketGranularity {
  const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
  if (days <= 7) return 'daily'
  if (days <= 31) return 'weekly'
  return 'monthly'
}

export function resolveModeGranularity(mode: InsightMode): BucketGranularity {
  return mode === 'monthly' ? 'daily' : 'monthly'
}

export interface PeriodRange {
  from: string
  to: string
}

export function computePeriodRange(mode: InsightMode, period: string): PeriodRange {
  if (mode === 'monthly') {
    const [year, month] = period.split('-').map(Number)
    const date = new Date(year, month - 1, 1)
    return { from: format(date, 'yyyy-MM-dd'), to: format(endOfMonth(date), 'yyyy-MM-dd') }
  }
  const year = Number(period)
  const date = new Date(year, 0, 1)
  return { from: format(date, 'yyyy-MM-dd'), to: format(endOfYear(date), 'yyyy-MM-dd') }
}

export interface ComparisonPeriods {
  previousPeriod: PeriodRange
  yearOverYear?: PeriodRange
}

export function computeComparisonPeriods(mode: InsightMode, period: string): ComparisonPeriods {
  if (mode === 'monthly') {
    const date = parseISO(period + '-01')
    const prev = subMonths(date, 1)
    const yoy = subYears(date, 1)
    return {
      previousPeriod: { from: format(startOfMonth(prev), 'yyyy-MM-dd'), to: format(endOfMonth(prev), 'yyyy-MM-dd') },
      yearOverYear: { from: format(startOfMonth(yoy), 'yyyy-MM-dd'), to: format(endOfMonth(yoy), 'yyyy-MM-dd') },
    }
  }
  const year = Number(period)
  const prevYear = year - 1
  const date = new Date(prevYear, 0, 1)
  return {
    previousPeriod: { from: format(startOfYear(date), 'yyyy-MM-dd'), to: format(endOfYear(date), 'yyyy-MM-dd') },
  }
}

export function buildBuckets(from: string, to: string, granularity: BucketGranularity): Bucket[] {
  const fromDate = parseISO(from)
  const toDate = parseISO(to)

  if (granularity === 'daily') {
    return eachDayOfInterval({ start: fromDate, end: toDate }).map((d) => ({
      key: format(d, 'yyyy-MM-dd'),
      start: d,
      end: d,
      label: format(d, 'MMM d'),
    }))
  }

  if (granularity === 'weekly') {
    const buckets: Bucket[] = []
    for (let cursor = fromDate; cursor <= toDate; cursor = addDays(cursor, 7)) {
      const naiveEnd = addDays(cursor, 6)
      const end = naiveEnd < toDate ? naiveEnd : toDate
      buckets.push({
        key: format(cursor, 'yyyy-MM-dd'),
        start: cursor,
        end,
        label: `${format(cursor, 'MMM d')} – ${format(end, 'MMM d')}`,
      })
    }
    return buckets
  }

  if (granularity === 'yearly') {
    return eachYearOfInterval({ start: startOfYear(fromDate), end: startOfYear(toDate) }).map((y) => ({
      key: format(y, 'yyyy'),
      start: startOfYear(y),
      end: endOfYear(y),
      label: format(y, 'yyyy'),
    }))
  }

  return eachMonthOfInterval({ start: startOfMonth(fromDate), end: startOfMonth(toDate) }).map((m) => ({
    key: format(m, 'yyyy-MM'),
    start: startOfMonth(m),
    end: endOfMonth(m),
    label: format(m, 'MMM yyyy'),
  }))
}
