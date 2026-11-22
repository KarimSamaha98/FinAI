import type { CSSProperties } from 'react'

/**
 * Placeholders in the shape of the content, for a first-ever load (cached
 * data shows instantly otherwise). They fade in only after a short delay
 * (CSS), so a fast load never flickers.
 */

interface SkeletonBlockProps {
  height?: CSSProperties['height']
  width?: CSSProperties['width']
  className?: string
}

/** A single grey shape: a chart, a card, a line of text. */
export function SkeletonBlock({ height = '1rem', width = '100%', className }: SkeletonBlockProps) {
  return (
    <div className={['skeleton-group', className].filter(Boolean).join(' ')} role="status" aria-label="Loading">
      <div className="skeleton" style={{ height, width }} />
    </div>
  )
}

/** Transaction rows: a date, a description with a subline, an amount. */
export function SkeletonRows({ count = 6, inset = false }: { count?: number; inset?: boolean }) {
  return (
    <ul className={`txn-list skeleton-group${inset ? ' txn-list--inset' : ''}`} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="skeleton-row" aria-hidden="true">
          <span className="skeleton skeleton-row-date" />
          <span className="skeleton-row-text">
            {/* Varied widths read as text, not a grid of bars. */}
            <span className="skeleton" style={{ width: `${55 + ((index * 17) % 30)}%` }} />
            <span className="skeleton skeleton-row-subline" />
          </span>
          <span className="skeleton skeleton-row-amount" />
        </li>
      ))}
    </ul>
  )
}

/** A few lines of text, for small panels. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="skeleton-group skeleton-lines" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="skeleton" style={{ width: `${90 - index * 15}%` }} aria-hidden="true" />
      ))}
    </div>
  )
}
