import { addMonths, format, parse } from 'date-fns'
import type { InsightMode } from 'shared-types'

/** 'yyyy-MM' → "October 2026"; yearly periods ('yyyy') are shown as-is. */
export function formatPeriod(mode: InsightMode, period: string): string {
  if (mode === 'monthly') {
    return format(parse(period + '-01', 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
  }
  return period
}

/** Moves a period by `delta` months (monthly) or years (yearly). */
export function shiftPeriod(mode: InsightMode, period: string, delta: number): string {
  if (mode === 'monthly') {
    return format(addMonths(parse(period + '-01', 'yyyy-MM-dd', new Date()), delta), 'yyyy-MM')
  }
  return String(Number(period) + delta)
}
