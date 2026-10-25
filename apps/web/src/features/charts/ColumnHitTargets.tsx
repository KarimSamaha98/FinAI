import { usePlotArea } from 'recharts'

interface ColumnHitTargetsProps {
  /** Number of categories on the band axis. */
  count: number
  /** 'horizontal' = columns along the X axis; 'vertical' = rows along the Y axis (labels included). */
  layout?: 'horizontal' | 'vertical'
  onPick: (index: number) => void
}

/**
 * Invisible click targets covering each category's whole band — the same
 * area the hover highlight fills — so a click or tap anywhere in it picks
 * that column, not just on the bar. Render as the chart's last child.
 */
export function ColumnHitTargets({ count, layout = 'horizontal', onPick }: ColumnHitTargetsProps) {
  const plot = usePlotArea()
  if (!plot || count === 0) return null

  const band = (layout === 'horizontal' ? plot.width : plot.height) / count
  return (
    <g className="chart-hit-targets">
      {Array.from({ length: count }, (_, i) =>
        layout === 'horizontal' ? (
          <rect key={i} x={plot.x + i * band} y={plot.y} width={band} height={plot.height} fill="transparent" onClick={() => onPick(i)} />
        ) : (
          <rect key={i} x={0} y={plot.y + i * band} width={plot.x + plot.width} height={band} fill="transparent" onClick={() => onPick(i)} />
        ),
      )}
    </g>
  )
}
