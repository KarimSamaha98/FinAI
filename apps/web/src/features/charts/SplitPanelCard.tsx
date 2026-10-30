import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Card } from '../../components/Card'

/** Matches `--duration-base`, the collapse transition the drawer animates with. */
const COLLAPSE_MS = 250

interface SplitPanelCardProps {
  /** Card title, rendered inside the card above the chart. */
  subheader?: string
  /** Instruction line under the subheader, e.g. "Click a bar to see its transactions". */
  hint?: string
  /** The chart or main content that shrinks when the drawer opens. */
  children: ReactNode
  /** Transaction breakdown shown in the inset panel. Only rendered when `isSplit`. */
  details?: ReactNode
  /** Whether the split panel is open for this card. */
  isSplit?: boolean
}

export function SplitPanelCard({ subheader, hint, children, details, isSplit }: SplitPanelCardProps) {
  const detailsRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)
  const [heldDetails, setHeldDetails] = useState<ReactNode>(null)
  const [closing, setClosing] = useState(false)

  // While open, remember the content: when selection clears the caller drops
  // `details` to null in the same render `isSplit` goes false, so the close
  // animation must paint the held (frozen) content while fading out.
  useEffect(() => {
    if (isSplit && details) {
      setHeldDetails(details)
      setClosing(false)
    }
  }, [isSplit, details])

  useEffect(() => {
    if (isSplit) {
      wasOpenRef.current = true
      setClosing(false)
      return
    }
    if (!wasOpenRef.current) return
    wasOpenRef.current = false
    // Close: hold the panel mounted with a fade-out while the drawer
    // collapses, then unmount after the transition completes.
    setClosing(true)
    const timeout = setTimeout(() => setClosing(false), COLLAPSE_MS)
    return () => clearTimeout(timeout)
  }, [isSplit])

  // Reset the scroll position on open and on every selection switch.
  useEffect(() => {
    if (isSplit) detailsRef.current?.scrollTo({ top: 0 })
  }, [isSplit, details])

  return (
    <Card style={{ padding: 'var(--space-4)' }}>
      {subheader && <h4 className="insights-subheader">{subheader}</h4>}
      {hint && <p className="insights-hint">{hint}</p>}
      <div className={`split-panel-card${isSplit ? ' is-split' : ''}`}>
        <div className="split-panel-chart">{children}</div>
        <div className="split-panel-drawer" aria-hidden={!isSplit}>
          {(isSplit || closing) && (
            <div ref={detailsRef} className={`split-panel-details${closing ? ' is-closing' : ''}`}>
              {isSplit ? details : heldDetails}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
