import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Drawer } from '../components/Drawer'

interface DrawerState {
  open: boolean
  title: string
  content: ReactNode | null
}

interface DrawerContextValue {
  openDrawer: (content: ReactNode, title: string) => void
  closeDrawer: () => void
  open: boolean
}

const DrawerContext = createContext<DrawerContextValue | null>(null)

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DrawerState>({ open: false, title: '', content: null })

  const openDrawer = useCallback((content: ReactNode, title: string) => {
    setState({ open: true, title, content })
  }, [])

  const closeDrawer = useCallback(() => {
    setState((prev) => ({ ...prev, open: false, content: null }))
  }, [])

  const value: DrawerContextValue = { openDrawer, closeDrawer, open: state.open }

  return (
    <DrawerContext.Provider value={value}>
      {children}
      <Drawer open={state.open} onClose={closeDrawer} title={state.title}>
        {state.content}
      </Drawer>
    </DrawerContext.Provider>
  )
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext)
  if (!ctx) throw new Error('useDrawer must be used within a DrawerProvider')
  return ctx
}
