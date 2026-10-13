import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from './icons'

interface BackButtonProps {
  /** Where to go when there's no earlier in-app page (opened directly or after a reload). */
  fallback: string
  /** Always go to `fallback` instead of the previous page (e.g. out of a multi-step flow). */
  alwaysFallback?: boolean
}

/** The large circled chevron on sub-pages: back to wherever the user came from. */
export function BackButton({ fallback, alwaysFallback = false }: BackButtonProps) {
  const navigate = useNavigate()

  function goBack() {
    // React Router numbers its history entries; idx 0 means this is the first page of the session.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0 && !alwaysFallback) navigate(-1)
    else navigate(fallback, { replace: true })
  }

  return (
    <button type="button" className="back-button" aria-label="Back" onClick={goBack}>
      <ChevronLeftIcon />
    </button>
  )
}

interface PageHeaderProps {
  title: string
  backTo: string
  /**
   * 'end' (default): back button on the right, returning to the previous page.
   * 'start': back button on the left, always going to `backTo` — for flows
   * like the import, where Back means leaving the whole flow.
   */
  backPlacement?: 'start' | 'end'
}

/** A sub-page's title with its back button. */
export function PageHeader({ title, backTo, backPlacement = 'end' }: PageHeaderProps) {
  if (backPlacement === 'start') {
    return (
      <div className="page-header page-header--back-start">
        <BackButton fallback={backTo} alwaysFallback />
        <h1>{title}</h1>
      </div>
    )
  }
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <BackButton fallback={backTo} />
    </div>
  )
}
