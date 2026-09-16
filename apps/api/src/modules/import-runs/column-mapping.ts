import { parse as parseDateWithFormat } from 'date-fns'
import type { AmountMapping, ColumnMapping, ColumnRef, CurrencyMapping } from 'shared-types'

export class RowParseError extends Error {
  constructor(
    public readonly rowIndex: number,
    message: string,
  ) {
    super(message)
  }
}

function resolveColumnIndex(ref: ColumnRef, headerRow: string[] | null): number {
  if (ref.type === 'index') return ref.value
  const index = headerRow?.indexOf(ref.value) ?? -1
  if (index === -1) {
    throw new Error(`Column "${ref.value}" not found in file header`)
  }
  return index
}

function extractCell(row: string[], ref: ColumnRef, headerRow: string[] | null): string {
  const index = resolveColumnIndex(ref, headerRow)
  return (row[index] ?? '').trim()
}

/**
 * Strips everything except digits, a decimal point, and a leading minus sign
 * — handles "$3299.59", "-$173.16", "25.05", and blank cells (returns null).
 */
export function parseAmountCell(raw: string): number | null {
  const stripped = raw.replace(/[^0-9.-]/g, '')
  if (!stripped) return null
  const value = Number(stripped)
  return Number.isFinite(value) ? value : null
}

function parseDateCell(raw: string, dateFormat: string): string | null {
  const parsed = parseDateWithFormat(raw, dateFormat, new Date())
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().slice(0, 10)
}

/** A row's own currency, resolved once per profile (fixed) or once per row (column). */
function resolveCurrency(row: string[], headerRow: string[] | null, currencyMapping: CurrencyMapping): string {
  if (currencyMapping.mode === 'fixed') return currencyMapping.code
  return extractCell(row, currencyMapping.column, headerRow).toUpperCase()
}

interface ResolvedAmount {
  amount: number
}

/**
 * Resolves the signed amount for one row per the profile's amount mode.
 * Single mode: one column, sign flips per signConvention. Dual mode: two
 * positive-only columns (expense/income) — exactly one populated is the
 * expected shape for a real row. Directional mode: a magnitude column
 * (always positive) plus a direction column compared against configured
 * inValue/outValue (e.g. Wise's "Direction" column, "IN"/"OUT"). Returns
 * null when there's no amount data for this profile (blank single cell, or
 * both dual cells blank) — the signal to skip the row entirely. Throws
 * RowParseError for ambiguous/malformed rows (both dual columns populated,
 * or a direction cell matching neither configured value), consistent with
 * blocking the whole import on any row-level parse error rather than
 * silently guessing which value is correct.
 */
function resolveAmount(
  row: string[],
  rowIndex: number,
  headerRow: string[] | null,
  amountMapping: AmountMapping,
): ResolvedAmount | null {
  if (amountMapping.mode === 'single') {
    const raw = extractCell(row, amountMapping.column, headerRow)
    const amount = parseAmountCell(raw)
    if (amount === null) return null
    return { amount: amountMapping.signConvention === 'positive_is_expense' ? -amount : amount }
  }

  if (amountMapping.mode === 'dual') {
    const rawExpense = extractCell(row, amountMapping.expenseColumn, headerRow)
    const rawIncome = extractCell(row, amountMapping.incomeColumn, headerRow)
    const expense = parseAmountCell(rawExpense)
    const income = parseAmountCell(rawIncome)

    if (expense === null && income === null) return null
    if (expense !== null && income !== null) {
      throw new RowParseError(
        rowIndex,
        `Both expense ("${rawExpense}") and income ("${rawIncome}") columns are populated — expected exactly one`,
      )
    }
    return { amount: expense !== null ? -expense : (income as number) }
  }

  const rawMagnitude = extractCell(row, amountMapping.amountColumn, headerRow)
  const magnitude = parseAmountCell(rawMagnitude)
  if (magnitude === null) return null

  const directionValue = extractCell(row, amountMapping.directionColumn, headerRow)
  if (directionValue === amountMapping.outValue) return { amount: -Math.abs(magnitude) }
  if (directionValue === amountMapping.inValue) return { amount: Math.abs(magnitude) }

  throw new RowParseError(
    rowIndex,
    `Direction "${directionValue}" matched neither the configured in value ("${amountMapping.inValue}") nor out value ("${amountMapping.outValue}")`,
  )
}

export interface ParsedRow {
  date: string
  amount: number
  currencyCode: string
  description: string
}

/**
 * Parses one raw row into a transaction candidate, or returns null if there's
 * no amount data for this profile (see resolveAmount) — the row is simply
 * not part of this profile's data. Throws RowParseError for a cell that has
 * content but fails to parse (bad date format, ambiguous dual-column row),
 * since a single bad row blocks the whole import per product decision —
 * better to fix the profile/date format than silently drop data.
 */
export function parseRow(
  row: string[],
  rowIndex: number,
  headerRow: string[] | null,
  mapping: ColumnMapping,
  dateFormat: string,
): ParsedRow | null {
  const resolved = resolveAmount(row, rowIndex, headerRow, mapping.amount)
  if (resolved === null) return null

  const rawDate = extractCell(row, mapping.date, headerRow)
  const date = parseDateCell(rawDate, dateFormat)
  if (!date) {
    throw new RowParseError(rowIndex, `Could not parse date "${rawDate}" using format "${dateFormat}"`)
  }

  return {
    date,
    amount: resolved.amount,
    currencyCode: resolveCurrency(row, headerRow, mapping.currency),
    description: extractCell(row, mapping.description, headerRow),
  }
}
