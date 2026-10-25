import { format, parse } from 'date-fns'
import type { InsightMode } from 'shared-types'

/** 'yyyy-MM' → "October 2026"; yearly periods ('yyyy') are shown as-is. */
export function formatPeriod(mode: InsightMode, period: string): string {
  if (mode === 'monthly') {
    return format(parse(period + '-01', 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  }
  return period
}
