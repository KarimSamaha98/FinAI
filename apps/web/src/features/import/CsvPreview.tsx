export interface ColumnAssignment {
  column: number
  label: string
}

interface CsvPreviewProps {
  /** Raw lines of the file, header (if any) included. */
  rows: string[][]
  hasHeader: boolean
  columnCount: number
  assignments: ColumnAssignment[]
  /** What clicking a column would assign right now (e.g. "Date"), or null when nothing is being asked. */
  pickLabel: string | null
  onPickColumn?: (column: number) => void
}

/**
 * The file's first lines, with a label over every column the profile has
 * assigned so far. When the current question asks for a column, clicking any
 * cell picks that column (the question below always offers a dropdown too, for
 * keyboard and screen-reader users).
 */
export function CsvPreview({ rows, hasHeader, columnCount, assignments, pickLabel, onPickColumn }: CsvPreviewProps) {
  const columns = Array.from({ length: columnCount }, (_, index) => index)
  const labelsFor = (column: number) => assignments.filter((a) => a.column === column).map((a) => a.label)
  const headerRow = hasHeader ? rows[0] : null
  const bodyRows = hasHeader ? rows.slice(1) : rows
  const picking = !!onPickColumn
  const pick = (column: number) => onPickColumn?.(column)
  const cellClass = (column: number) => (labelsFor(column).length ? 'is-assigned' : undefined)

  return (
    <div className={`csv-preview${picking ? ' is-picking' : ''}`}>
      {picking && <p className="csv-preview-pick-hint">Click a column to set it as {pickLabel}</p>}
      <div className="csv-preview-scroll">
        <table>
          <thead>
            <tr className="csv-preview-labels">
              {columns.map((column) => (
                <th key={column} scope="col" onClick={() => pick(column)}>
                  {labelsFor(column).map((label) => (
                    <span key={label} className="csv-preview-label">
                      {label}
                    </span>
                  ))}
                </th>
              ))}
            </tr>
            {headerRow && (
              <tr className="csv-preview-header">
                {columns.map((column) => (
                  <th key={column} scope="col" className={cellClass(column)} onClick={() => pick(column)}>
                    {headerRow[column] ?? ''}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column) => (
                  <td key={column} className={cellClass(column)} onClick={() => pick(column)}>
                    {row[column] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
