import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Shared open/close behaviour for the filter-bar dropdowns (multi-select,
 * single select, date picker): closes on an outside click or Escape (focus
 * back on the trigger), and flips the panel to open leftwards when it would
 * run off the right edge of the screen.
 */
export function useDropdown() {
  const [open, setOpen] = useState(false)
  const [alignEnd, setAlignEnd] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        // Only the dropdown closes — not a modal it sits in (a <dialog> closes on Escape by default).
        event.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  // Measure before paint so the panel never flashes off-screen.
  useLayoutEffect(() => {
    if (!open) {
      setAlignEnd(false)
      return
    }
    const root = rootRef.current?.getBoundingClientRect()
    const panel = panelRef.current?.getBoundingClientRect()
    if (root && panel) setAlignEnd(root.left + panel.width > document.documentElement.clientWidth - 8)
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return { open, setOpen, close, alignEnd, rootRef, triggerRef, panelRef }
}
