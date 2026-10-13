import { useCallback, useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'

const GAP = 6
const EDGE = 8
// Before the first measurement. Placement happens before paint, so this never
// shows — and the panel stays focusable (a hidden one can't take focus).
const UNPLACED: CSSProperties = { position: 'fixed', top: 0, left: 0 }

/**
 * Positions a form field's dropdown panel with `position: fixed`, so it isn't
 * clipped by a modal or a list with `overflow: hidden`. It matches the
 * field's width, opens upwards when there isn't room below, and follows the
 * field while the page or any scroll container scrolls.
 */
export function useFloatingPanel(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  {
    /** Narrowest the panel may be (px), e.g. so a calendar fits under a short field. */
    minWidth = 0,
    /** Cap the height to the space available (lists scroll); off for a calendar, which can't. */
    capHeight = true,
  }: { minWidth?: number; capHeight?: boolean } = {},
) {
  const [style, setStyle] = useState<CSSProperties>(UNPLACED)

  const place = useCallback(() => {
    const anchor = anchorRef.current?.getBoundingClientRect()
    const panel = panelRef.current
    if (!anchor || !panel) return
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = window.innerHeight
    const panelHeight = panel.offsetHeight
    const width = Math.min(Math.max(anchor.width, minWidth), viewportWidth - EDGE * 2)
    const spaceBelow = viewportHeight - anchor.bottom - GAP - EDGE
    const spaceAbove = anchor.top - GAP - EDGE
    const openUp = panelHeight > spaceBelow && spaceAbove > spaceBelow
    const left = Math.min(Math.max(EDGE, anchor.left), viewportWidth - width - EDGE)
    setStyle({
      position: 'fixed',
      left,
      width,
      ...(capHeight ? { maxHeight: Math.max(160, Math.min(288, openUp ? spaceAbove : spaceBelow)) } : {}),
      right: 'auto',
      ...(openUp ? { top: 'auto', bottom: viewportHeight - anchor.top + GAP } : { top: anchor.bottom + GAP, bottom: 'auto' }),
    })
  }, [anchorRef, panelRef, minWidth, capHeight])

  useLayoutEffect(() => {
    if (!open) return
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, place])

  return { style: open ? style : UNPLACED, reposition: place }
}
