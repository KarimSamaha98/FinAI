import { useEffect, useRef, type ReactNode } from 'react'
import { ChevronRightIcon } from './icons'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

/**
 * A right-side slide drawer that overlays the entire app shell (content + nav
 * rail). Closes on Escape, the `>>` button, or clicking on non-clickable
 * (empty) areas of the main content. Clicking on actual interactive elements
 * (charts, buttons, links) does NOT close the drawer — those navigate or
 * reopen the drawer with the clicked item. No scrim.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (open) {
      previousFocus.current = document.activeElement as HTMLElement | null
      requestAnimationFrame(() => {
        panelRef.current?.focus({ preventScroll: true })
      })
    } else {
      previousFocus.current?.focus({ preventScroll: true })
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const panel = panelRef.current
      if (panel && !panel.contains(target)) {
        const tagName = target.tagName?.toLowerCase()
        const isInteractive =
          tagName === 'button' ||
          tagName === 'a' ||
          tagName === 'input' ||
          target.closest('button') ||
          target.closest('a') ||
          target.closest('[role="button"]') ||
          target.closest('.chart-hit-targets') ||
          target.closest('.category-change-tile') ||
          target.closest('.txn-row') ||
          target.closest('.heatmap-day') ||
          getComputedStyle(target).cursor === 'pointer'
        if (!isInteractive) {
          onClose()
        }
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open, onClose])

  return (
    <section
      ref={panelRef}
      className={`drawer-panel${open ? ' is-open' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      tabIndex={-1}
    >
      <header className="drawer-header">
        <button type="button" className="drawer-close-button" onClick={onClose} aria-label="Close drawer">
          <span className="drawer-close-icon">
            <ChevronRightIcon />
            <ChevronRightIcon />
          </span>
        </button>
        <h3 className="drawer-title">{title}</h3>
      </header>
      <div className="drawer-body">
        {children}
      </div>
    </section>
  )
}
