import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/** Revealed balances hide again after the app has been away this long. */
export const REHIDE_AFTER_MS = 5 * 60 * 1000

const STORAGE_KEY = 'finai.privacy'

interface Stored {
  hidden: boolean
  /** When the app was last left (tab hidden or page closed), ms since epoch. */
  leftAt: number | null
}

interface PrivacyContextValue {
  /** Balances and net worth are masked. */
  hidden: boolean
  setHidden: (hidden: boolean) => void
  toggle: () => void
}

const PrivacyContext = createContext<PrivacyContextValue | null>(null)

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Stored>
      return { hidden: parsed.hidden === true, leftAt: typeof parsed.leftAt === 'number' ? parsed.leftAt : null }
    }
  } catch {
    // Storage unavailable (private window, blocked): behave as before, visible.
  }
  return { hidden: false, leftAt: null }
}

function write(value: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Not persisted; the in-memory choice still applies for this session.
  }
}

/** Revealed, but away long enough that it should be hidden again. */
function staleReveal({ hidden, leftAt }: Stored): boolean {
  return !hidden && leftAt !== null && Date.now() - leftAt >= REHIDE_AFTER_MS
}

/**
 * Privacy mode: masks what the user *has* (net worth, balances), never what
 * they spend. Remembered per device; a reveal lapses once the app has been
 * left for REHIDE_AFTER_MS, so being out in public later doesn't depend on
 * remembering to hide again.
 */
export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [hidden, setHiddenState] = useState(() => {
    const stored = read()
    return stored.hidden || staleReveal(stored)
  })

  const setHidden = useCallback((next: boolean) => {
    setHiddenState(next)
    write({ hidden: next, leftAt: null })
  }, [])

  const toggle = useCallback(() => setHidden(!hidden), [hidden, setHidden])

  useEffect(() => {
    function onVisibility() {
      const stored = read()
      if (document.visibilityState === 'hidden') {
        write({ ...stored, hidden, leftAt: Date.now() })
      } else if (staleReveal({ hidden, leftAt: stored.leftAt })) {
        setHidden(true)
      } else {
        // Back in time: the absence is over, so a later reload doesn't count it.
        write({ hidden, leftAt: null })
      }
    }
    function onLeave() {
      write({ hidden, leftAt: Date.now() })
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', onLeave)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', onLeave)
    }
  }, [hidden, setHidden])

  return <PrivacyContext.Provider value={{ hidden, setHidden, toggle }}>{children}</PrivacyContext.Provider>
}

export function usePrivacy(): PrivacyContextValue {
  const value = useContext(PrivacyContext)
  if (!value) throw new Error('usePrivacy must be used inside PrivacyProvider')
  return value
}
