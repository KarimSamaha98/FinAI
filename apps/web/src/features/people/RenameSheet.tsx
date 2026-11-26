import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Alert } from '../../components/Alert'
import { apiErrorMessage, peopleApi } from '../../hooks/usePeople'

/** Rename a person. Names are unique per user (the API says so if one's taken). */
export function RenameSheet({ contactId, name, onClose }: { contactId: string; name: string; onClose: () => void }) {
  const [value, setValue] = useState(name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmed = value.trim()

  async function save() {
    if (!trimmed || trimmed === name) return onClose()
    setSaving(true)
    setError(null)
    try {
      await peopleApi.renameContact(contactId, trimmed)
      onClose()
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t rename'))
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Rename" size="sm">
      <form
        className="rename-sheet"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <label>
          Name
          <input type="text" value={value} maxLength={80} autoFocus onChange={(e) => setValue(e.target.value)} />
        </label>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="action-menu-confirm">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={saving} disabled={!trimmed}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
