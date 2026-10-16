import { format, parseISO } from 'date-fns'

/** Formats an ISO date string ("2026-09-07") as a human-readable label ("Sep 7, 2026"). */
export function formatDate(dateISO: string): string {
  return format(parseISO(dateISO), 'MMM d, yyyy')
}

/** Formats an ISO date as a month label ("Sep 2026") — for virtual split portions, which have no real day. */
export function formatMonthYear(dateISO: string): string {
  return format(parseISO(dateISO), 'MMM yyyy')
}
