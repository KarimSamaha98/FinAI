import { addDays, differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, endOfMonth, format, parseISO, startOfMonth } from 'date-fns'
import type { BucketGranularity } from 'shared-types'

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
    // Consecutive 7-day windows anchored at `from` (not ISO-week-aligned) —
    // the simplest unambiguous definition for an arbitrary custom range; the
    // final window is truncated at `to`.
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

  return eachMonthOfInterval({ start: startOfMonth(fromDate), end: startOfMonth(toDate) }).map((m) => ({
    key: format(m, 'yyyy-MM'),
    start: startOfMonth(m),
    end: endOfMonth(m),
    label: format(m, 'MMM yyyy'),
  }))
}
