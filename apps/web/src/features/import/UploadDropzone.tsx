import { useRef, useState, type DragEvent } from 'react'

const ACCEPT = '.csv,.xlsx,.xls'
const MAX_MB = 5

interface UploadDropzoneProps {
  uploading: boolean
  onFile: (file: File) => void
  /** Smaller version for the Add transaction dialog. */
  compact?: boolean
}

/** Step 1 of the import flow: drop a bank export here or choose one. */
export function UploadDropzone({ uploading, onFile, compact }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file && !uploading) onFile(file)
  }

  return (
    <div
      className={`dropzone${compact ? ' dropzone--compact' : ''}${dragging ? ' is-dragging' : ''}${uploading ? ' is-busy' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {!compact && (
        <span className="dropzone-badge" aria-hidden="true">
          CSV
        </span>
      )}
      <p className="dropzone-title">{uploading ? 'Uploading…' : compact ? 'Drop a bank CSV here' : 'Drop your bank export here'}</p>
      <p className="dropzone-hint">
        CSV or Excel (.xlsx, .xls) · up to {MAX_MB} MB
      </p>
      <button type="button" className="btn btn-primary" disabled={uploading} onClick={() => inputRef.current?.click()}>
        Choose a file
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="visually-hidden"
        tabIndex={-1}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
