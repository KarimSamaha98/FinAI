import Papa from 'papaparse'
import * as XLSX from 'xlsx'

const XLSX_EXTENSIONS = ['.xlsx', '.xls']

function isXlsx(filename: string): boolean {
  const lower = filename.toLowerCase()
  return XLSX_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * Parses raw file bytes into a rectangular array of string cells, before any
 * column-mapping or type conversion. XLSX workbooks with multiple sheets use
 * only the first sheet, matching typical single-statement bank exports.
 */
export function parseRawRows(buffer: Buffer, originalFilename: string, delimiter: string): string[][] {
  if (isXlsx(originalFilename)) {
    const workbook = XLSX.read(buffer, { type: 'buffer' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, raw: false, defval: '' })
    return rows.filter((row) => row.some((cell) => cell.trim() !== ''))
  }

  const { data } = Papa.parse<string[]>(buffer.toString('utf-8'), { delimiter, skipEmptyLines: true })
  return data
}
