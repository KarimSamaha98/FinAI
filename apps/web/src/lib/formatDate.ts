import { format, parseISO } from 'date-fns'

/** Formats an ISO date string ("2026-09-07") as a human-readable label ("Sep 7, 2026"). */
export function formatDate(dateISO: string): string {
  return format(parseISO(dateISO), 'MMM d, yyyy')
}
