import { useNavigate } from 'react-router-dom'
import { ChevronLeftIcon } from './icons'

interface BackButtonProps {
  /** Where to go when there's no earlier in-app page (opened directly or after a reload). */
  fallback: string
}

/** The large circled chevron at the top right of sub-pages: back to wherever the user came from. */
export function BackButton({ fallback }: BackButtonProps) {
  const navigate = useNavigate()

  function goBack() {
    // React Router numbers its history entries; idx 0 means this is the first page of the session.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigate(-1)
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
}

/** A sub-page's title with the back button on the right. */
export function PageHeader({ title, backTo }: PageHeaderProps) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <BackButton fallback={backTo} />
    </div>
  )
}
