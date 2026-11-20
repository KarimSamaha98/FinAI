import { isValid, parse } from 'date-fns'
import { DATE_FORMAT_PRESETS } from './date-format-presets'

export type AmountLayout = 'single' | 'dual' | 'directional'

/** Everything the profile wizard asks, pre-filled from the sample file where it can tell. */
export interface ProfileAnswers {
  hasHeader: boolean
  dateCol: number | null
  descriptionCol: number | null
  layout: AmountLayout | null
  /** single and directional: the amount column. */
  amountCol: number | null
  /** dual: the money-out and money-in columns. */
  outCol: number | null
  inCol: number | null
  /** directional: the column that says in or out. */
  directionCol: number | null
  /**
   * The answer to "is this example row money out?" (see `exampleFor`). null =
   * not answered: the wizard falls back to `suggestedExampleIsOut`.
   */
  exampleIsOut: boolean | null
}

/** Same rules as the backend's parseAmountCell: keep digits, dot and minus. */
export function parseAmount(raw: string | undefined): number | null {
  const stripped = (raw ?? '').replace(/[^0-9.-]/g, '')
  if (!stripped || stripped === '-' || stripped === '.') return null
  const value = Number(stripped)
  return Number.isFinite(value) ? value : null
}

/** Looks like a money amount (not a card number or reference): optional sign/currency, digits, decimals. */
function isAmountLike(raw: string): boolean {
  const cleaned = raw.trim().replace(/[$€£¥,\s]/g, '').replace(/^\((.*)\)$/, '-$1')
  if (!/^[-+]?\d+(\.\d{1,4})?$/.test(cleaned)) return false
  // Long bare integers are usually references or card numbers, not amounts.
  return cleaned.includes('.') || cleaned.replace(/^[-+]/, '').length <= 7
}

function isDateLike(raw: string): boolean {
  const trimmed = raw.trim()
  return !!trimmed && DATE_FORMAT_PRESETS.some((preset) => isValid(parse(trimmed, preset.value, new Date())))
}

const cell = (row: string[], column: number) => (row[column] ?? '').trim()

function nonEmpty(rows: string[][], column: number): string[] {
  return rows.map((row) => cell(row, column)).filter(Boolean)
}

/** Header if the first row has no dates or amounts where the next rows do. */
export function detectHeader(rows: string[][]): boolean {
  if (rows.length < 2) return false
  const typed = (row: string[]) => row.filter((value) => isDateLike(value) || isAmountLike(value)).length
  return typed(rows[0]) === 0 && typed(rows[1]) > 0
}

/** The first format that parses every given cell (so "24/06/2026" settles dd/MM vs MM/dd). */
export function detectDateFormatFor(values: string[]): string | null {
  if (values.length === 0) return null
  const preset = DATE_FORMAT_PRESETS.find((p) => values.every((value) => isValid(parse(value, p.value, new Date()))))
  return preset?.value ?? null
}

/** Distinct non-empty values of a column, in order of appearance. */
export function distinctValues(rows: string[][], column: number): string[] {
  return [...new Set(nonEmpty(rows, column))]
}

/** Guess which of a direction column's two values means money in vs out (e.g. Wise's IN/OUT). */
export function guessDirectionValues(values: string[]): { inValue: string; outValue: string } | null {
  if (values.length !== 2) return null
  const isIn = (v: string) => /\b(in|credit|cr|deposit|incoming)\b/i.test(v)
  const isOut = (v: string) => /\b(out|debit|dr|withdrawal|outgoing)\b/i.test(v)
  const [a, b] = values
  if (isIn(a) || isOut(b)) return { inValue: a, outValue: b }
  if (isIn(b) || isOut(a)) return { inValue: b, outValue: a }
  return null
}

/** Pre-fills every answer it can from the raw rows (header included, if any). */
export function detectProfile(rows: string[][]): ProfileAnswers {
  const hasHeader = detectHeader(rows)
  const data = hasHeader ? rows.slice(1) : rows
  const columnCount = Math.max(0, ...rows.map((row) => row.length))
  const columns = Array.from({ length: columnCount }, (_, i) => i)

  // Date: the first column whose cells all parse with one format.
  let dateCol: number | null = null
  for (const column of columns) {
    const values = nonEmpty(data, column)
    const format = values.length && values.every(isDateLike) ? detectDateFormatFor(values) : null
    if (format) {
      dateCol = column
      break
    }
  }

  const others = columns.filter((c) => c !== dateCol)
  const isNumeric = (c: number) => {
    const values = nonEmpty(data, c)
    return values.length > 0 && values.every(isAmountLike)
  }
  const isEmpty = (c: number) => nonEmpty(data, c).length === 0
  const numeric = others.filter(isNumeric)

  // Description: the text column with the longest average value.
  const textColumns = others.filter((c) => !isNumeric(c) && !isEmpty(c))
  const averageLength = (c: number) => {
    const values = nonEmpty(data, c)
    return values.reduce((sum, v) => sum + v.length, 0) / values.length
  }
  const descriptionCol = textColumns.length ? textColumns.reduce((best, c) => (averageLength(c) > averageLength(best) ? c : best)) : null

  // Amounts.
  const answers: ProfileAnswers = {
    hasHeader,
    dateCol,
    descriptionCol,
    layout: null,
    amountCol: null,
    outCol: null,
    inCol: null,
    directionCol: null,
    exampleIsOut: null,
  }
  const mutuallyExclusive = (a: number, b: number) => data.every((row) => !(cell(row, a) && cell(row, b)))

  // Two neighbouring amount columns never filled on the same row (or one still empty in the sample) → out/in columns.
  for (const a of numeric) {
    for (const b of [a + 1, a - 1]) {
      if (b === dateCol || b === descriptionCol || b < 0 || b >= columnCount) continue
      if ((isNumeric(b) || isEmpty(b)) && mutuallyExclusive(a, b)) {
        const [left, right] = a < b ? [a, b] : [b, a]
        // Exports list money out first (Debit, Credit) far more often than the reverse.
        return { ...answers, layout: 'dual', outCol: left, inCol: right }
      }
    }
  }

  // An amount plus a short two-valued column on every row → directional (e.g. Wise IN/OUT).
  const directionCol = textColumns.find(
    (c) => c !== descriptionCol && nonEmpty(data, c).length === data.length && distinctValues(data, c).length === 2 && averageLength(c) <= 12,
  )
  if (numeric.length && directionCol !== undefined) {
    return { ...answers, layout: 'directional', amountCol: numeric[0], directionCol }
  }

  if (numeric.length) return { ...answers, layout: 'single', amountCol: numeric[0] }
  return answers
}

/** The row the "Money in/out" step asks about, and what it shows. */
export interface MoneyExample {
  rowIndex: number
  description: string
  /** What the file shows: the amount (single, dual) or the direction value (directional). */
  shown: string
  /** The column it's in (dual), for "under Debit". */
  columnName?: string
}

/** First data row with something to ask about, for the answers' layout and columns. */
export function exampleFor(data: string[][], answers: ProfileAnswers, columnName: (c: number) => string): MoneyExample | null {
  const description = (row: string[]) => (answers.descriptionCol !== null ? cell(row, answers.descriptionCol) : '') || 'This row'
  const find = (column: number | null, accept: (value: string) => boolean) => {
    if (column === null) return null
    const rowIndex = data.findIndex((row) => accept(cell(row, column)))
    return rowIndex === -1 ? null : { rowIndex, value: cell(data[rowIndex], column) }
  }
  const nonZero = (value: string) => {
    const amount = parseAmount(value)
    return amount !== null && amount !== 0
  }

  if (answers.layout === 'single') {
    const hit = find(answers.amountCol, nonZero)
    return hit && { rowIndex: hit.rowIndex, description: description(data[hit.rowIndex]), shown: hit.value }
  }
  if (answers.layout === 'dual') {
    const hit = find(answers.outCol, nonZero)
    return hit && { rowIndex: hit.rowIndex, description: description(data[hit.rowIndex]), shown: hit.value, columnName: columnName(answers.outCol!) }
  }
  if (answers.layout === 'directional') {
    const hit = find(answers.directionCol, (value) => !!value)
    return hit && { rowIndex: hit.rowIndex, description: description(data[hit.rowIndex]), shown: hit.value }
  }
  return null
}

/** The pre-selected answer to "is this example money out?", from the data. */
export function suggestedExampleIsOut(data: string[][], answers: ProfileAnswers, example: MoneyExample | null): boolean | null {
  if (!example) return null
  if (answers.layout === 'dual') return true // detection puts the first column as money out
  if (answers.layout === 'directional' && answers.directionCol !== null) {
    const guess = guessDirectionValues(distinctValues(data, answers.directionCol))
    return guess ? example.shown === guess.outValue : null
  }
  if (answers.layout === 'single' && answers.amountCol !== null) {
    // Mostly positive numbers usually means spending is written as positive (card statements).
    const amounts = data.map((row) => parseAmount(cell(row, answers.amountCol!))).filter((v): v is number => v !== null && v !== 0)
    const positives = amounts.filter((v) => v > 0).length
    const mostlyPositiveIsOut = positives >= amounts.length - positives
    const exampleValue = parseAmount(example.shown) ?? 0
    return exampleValue > 0 ? mostlyPositiveIsOut : !mostlyPositiveIsOut
  }
  return null
}
