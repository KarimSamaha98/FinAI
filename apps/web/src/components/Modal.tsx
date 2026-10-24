import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // showModal() focuses the first focusable element (the ✕); a field marked
      // data-autofocus wins instead, with any text in it selected (e.g. a rename).
      const field = dialog.querySelector<HTMLElement>('[data-autofocus]')
      field?.focus()
      if (field instanceof HTMLInputElement) field.select()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} className="sheet">
      <div className="sheet-body">
        <div className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
