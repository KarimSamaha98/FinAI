import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

const STORAGE_KEY = 'finai.scroll'

function readPositions(): Record<string, number> {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>
  } catch {
    return {}
  }
}

function savePosition(key: string, y: number) {
  try {
    const positions = readPositions()
    positions[key] = y
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(positions))
  } catch {
    // Storage unavailable: Back just starts at the top, as before.
  }
}

/**
 * Back/Forward to a page that loads its data on arrival: return to where it
 * was scrolled once `ready` (its content is on screen). React Router's
 * <ScrollRestoration> restores straight away, while the page is still a
 * "Loading…" line, so the position gets clamped to the top.
 *
 * Positions are recorded per history entry while the page is scrolled.
 */
export function useScrollRestoreWhenReady(ready: boolean) {
  const location = useLocation()
  // The first page of a load is always keyed "default", so add the path:
  // reloading one page must not restore another's position.
  const key = `${location.key}|${location.pathname}`
  const navigationType = useNavigationType()
  // Where to return to, read on arrival: once the page starts scrolling (e.g.
  // <ScrollRestoration>'s own, clamped attempt) the stored value is overwritten.
  const [target] = useState(() => (navigationType === 'POP' ? readPositions()[key] ?? null : null))
  const pending = useRef(target !== null)
  // Cleared synchronously when this entry stops being current (a layout
  // cleanup runs before the next page's scroll-to-top), so a late scroll
  // event from that reset is never recorded against this entry.
  const current = useRef(false)
  useLayoutEffect(() => {
    current.current = true
    return () => {
      current.current = false
    }
  }, [key])

  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (current.current) savePosition(key, window.scrollY)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
    }
  }, [key])

  useEffect(() => {
    if (!ready || !pending.current) return
    pending.current = false
    const y = target
    if (!y) return
    window.scrollTo(0, y)
    if (Math.abs(window.scrollY - y) < 2) return

    // Still too short (a panel loading its own rows, say): try again as the
    // page grows, until it fits, the user scrolls themselves, or a moment passes.
    const observer = new ResizeObserver(() => {
      window.scrollTo(0, y)
      if (Math.abs(window.scrollY - y) < 2) stop()
    })
    const timeout = window.setTimeout(stop, 3000)
    const userEvents = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    function stop() {
      observer.disconnect()
      window.clearTimeout(timeout)
      for (const type of userEvents) window.removeEventListener(type, stop)
    }
    observer.observe(document.body)
    for (const type of userEvents) window.addEventListener(type, stop, { passive: true })
    return stop
  }, [ready, target])
}
