import { useState } from 'react'

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
  /** Columns already assigned to another field can't be picked again. */
  canPickColumn?: (column: number) => boolean
  /** Several fields to pick on this step: the bar switches which one a click fills (`pickLabel` is the current one). */
  targets?: { key: string; label: string }[]
  onTargetChange?: (key: string) => void
  /** The row of field labels above the table (off when no column is assigned yet, e.g. the column names step). */
  showLabels?: boolean
  /** Tint the header row, to show it's read as column names. */
  highlightHeader?: boolean
  /** The column's name, for screen readers ("Set Amount as Date"). */
  columnName?: (column: number) => string
}

/**
 * The file's first lines, with a label over every column the profile has
 * assigned so far. When the current question asks for a column, the whole
 * column lights up on hover and clicking any of its cells picks it (the
 * question above says which field; a bar switches fields when there are several). Each
 * column also has a button in the label row, for keyboard and screen readers.
 */
export function CsvPreview({ rows, hasHeader, columnCount, assignments, pickLabel, onPickColumn, canPickColumn, targets, onTargetChange, showLabels = true, highlightHeader = false, columnName }: CsvPreviewProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const columns = Array.from({ length: columnCount }, (_, index) => index)
  const labelsFor = (column: number) => assignments.filter((a) => a.column === column).map((a) => a.label)
  const headerRow = hasHeader ? rows[0] : null
  const bodyRows = hasHeader ? rows.slice(1) : rows
  const picking = !!onPickColumn && !!pickLabel
  const pickable = (column: number) => picking && (canPickColumn?.(column) ?? true)
  const pick = (column: number) => {
    if (pickable(column)) onPickColumn?.(column)
  }
  const cellProps = (column: number) => ({
    className:
      [labelsFor(column).length ? 'is-assigned' : '', pickable(column) ? 'is-pickable' : picking ? 'is-locked' : '', pickable(column) && hovered === column ? 'is-hovered' : '']
        .filter(Boolean)
        .join(' ') || undefined,
    onClick: () => pick(column),
    onMouseEnter: () => setHovered(column),
  })

  return (
    <div className={`csv-preview${picking ? ' is-picking' : ''}`}>
      {/* A bar only when it adds something: switching between several fields. */}
      {picking && targets && (
        <div className="csv-preview-pick-hint">
          <span>Click a column to set it as</span>
          <span className="csv-preview-targets" role="group" aria-label="Field to set">
            {targets.map((target) => (
              <button
                key={target.key}
                type="button"
                className={`csv-preview-target${target.label === pickLabel ? ' is-active' : ''}`}
                aria-pressed={target.label === pickLabel}
                onClick={() => onTargetChange?.(target.key)}
              >
                {target.label}
              </button>
            ))}
          </span>
        </div>
      )}
      <div className="csv-preview-scroll">
        <table onMouseLeave={() => setHovered(null)}>
          <thead>
            {showLabels && <tr className="csv-preview-labels">
              {columns.map((column) => (
                <th key={column} scope="col" {...cellProps(column)}>
                  {pickable(column) && (
                    <button
                      type="button"
                      className="csv-preview-pick-button"
                      aria-label={`Set ${columnName?.(column) ?? `column ${column + 1}`} as ${pickLabel}`}
                      onFocus={() => setHovered(column)}
                      onBlur={() => setHovered(null)}
                      onClick={(event) => {
                        event.stopPropagation()
                        pick(column)
                      }}
                    />
                  )}
                  {labelsFor(column).map((label) => (
                    <span key={label} className="csv-preview-label">
                      {label}
                    </span>
                  ))}
                </th>
              ))}
            </tr>}
            {headerRow && (
              <tr className={`csv-preview-header${highlightHeader ? ' is-highlighted' : ''}`}>
                {columns.map((column) => (
                  <th key={column} scope="col" {...cellProps(column)}>
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
                  <td key={column} {...cellProps(column)}>
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
