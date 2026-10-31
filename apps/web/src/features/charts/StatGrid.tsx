import { Card } from '../../components/Card'

export interface StatTileItem {
  key: string
  /** Small muted label above the value, e.g. "Total Expense". */
  label: string
  /** Large primary value, e.g. "$4,200" or "+23%". */
  value: string
  /** Optional emphasis color for the value. */
  color?: string
}

interface StatGridProps {
  items: StatTileItem[]
  /** Card subheader rendered inside the card, e.g. "Summary". */
  title?: string
  /** Instruction line under the subheader. */
  hint?: string
}

/**
 * One card holding a grid of stat tiles — the shared card structure used by
 * the Summary card and the Changes card. Up to 4 equal tiles per row, two
 * per row on narrow screens.
 */
export function StatGrid({ items, title, hint }: StatGridProps) {
  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      {title && <h4 className="insights-subheader">{title}</h4>}
      {hint && <p className="insights-hint">{hint}</p>}
      <StatTiles items={items} />
    </Card>
  )
}

/** Just the tile grid, for cards that hold more than one group of tiles (e.g. Summary + Changes). */
export function StatTiles({ items }: { items: StatTileItem[] }) {
  return (
    <div className="changes-grid">
      {items.map(({ key, label, value, color }) => (
        <div key={key} className="change-tile">
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>{label}</p>
          <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 600, color: color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{value}</p>
        </div>
      ))}
    </div>
  )
}
