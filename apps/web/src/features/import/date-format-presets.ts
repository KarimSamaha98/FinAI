import { isValid, parse } from 'date-fns'

/**
 * Candidates are tried in order for auto-detection — earlier entries win
 * ties on genuinely ambiguous inputs (e.g. "01/02/2026" matches both
 * MM/dd/yyyy and dd/MM/yyyy; MM/dd/yyyy wins since it's listed first). The
 * live preview lets the user catch a wrong guess before saving.
 */
export const DATE_FORMAT_PRESETS = [
  { label: '2026-06-24 (ISO)', value: 'yyyy-MM-dd' },
  { label: '24 Jun 2026', value: 'd MMM yyyy' },
  { label: 'Jun 24, 2026', value: 'MMM d, yyyy' },
  { label: '06/24/2026 (US)', value: 'MM/dd/yyyy' },
  { label: '24/06/2026', value: 'dd/MM/yyyy' },
  { label: '24-06-2026', value: 'dd-MM-yyyy' },
]

/** Tries each preset against a sample cell, returning the first that parses to a valid date. */
export function detectDateFormat(sample: string): string | null {
  const trimmed = sample.trim()
  for (const preset of DATE_FORMAT_PRESETS) {
    if (isValid(parse(trimmed, preset.value, new Date()))) {
      return preset.value
    }
  }
  return null
}

/** Same parsing path as the backend's parseDateCell, for a live "raw → parsed" preview. */
export function previewParsedDate(sample: string, dateFormat: string): string | null {
  const parsed = parse(sample.trim(), dateFormat, new Date())
  if (!isValid(parsed)) return null
  return parsed.toISOString().slice(0, 10)
}
