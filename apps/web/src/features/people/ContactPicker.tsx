import { useState } from 'react'
import type { Contact } from 'shared-types'
import { apiErrorMessage, peopleApi, useContacts } from '../../hooks/usePeople'
import { Alert } from '../../components/Alert'
import { PersonInitials } from './PersonInitials'

interface ContactPickerProps {
  selectedIds: string[]
  onChange: (ids: string[]) => void
  /** One person or several. */
  multiple?: boolean
  /** People to leave out (e.g. already in the split). */
  excludeIds?: string[]
}

/**
 * Pick people by name. Typing filters the list; a name that isn't there yet
 * can be added on the spot (it becomes a contact; no email or phone needed).
 */
export function ContactPicker({ selectedIds, onChange, multiple = false, excludeIds = [] }: ContactPickerProps) {
  const { contacts, loading } = useContacts()
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmed = query.trim()
  const visible = contacts.filter((c) => !excludeIds.includes(c.id) && c.displayName.toLowerCase().includes(trimmed.toLowerCase()))
  const exactMatch = contacts.some((c) => c.displayName.toLowerCase() === trimmed.toLowerCase())

  function toggle(contact: Contact) {
    if (!multiple) {
      onChange([contact.id])
      return
    }
    onChange(selectedIds.includes(contact.id) ? selectedIds.filter((id) => id !== contact.id) : [...selectedIds, contact.id])
  }

  async function add() {
    if (!trimmed || exactMatch) return
    setAdding(true)
    setError(null)
    try {
      const contact = await peopleApi.createContact(trimmed)
      onChange(multiple ? [...selectedIds, contact.id] : [contact.id])
      setQuery('')
    } catch (err) {
      setError(apiErrorMessage(err, 'Couldn’t add that person'))
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="contact-picker">
      <input
        type="text"
        value={query}
        maxLength={80}
        placeholder={contacts.length ? 'Search or add a name' : 'Add a name'}
        aria-label="Search or add a person"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (visible.length === 1 && trimmed) toggle(visible[0])
            else void add()
          }
        }}
      />
      {error && <Alert variant="error">{error}</Alert>}
      <ul className="contact-picker-list" role="listbox" aria-multiselectable={multiple} aria-label="People">
        {trimmed && !exactMatch && (
          <li>
            <button type="button" className="contact-picker-row is-add" onClick={() => void add()} disabled={adding}>
              <span className="person-initials is-add" aria-hidden="true">+</span>
              <span className="contact-picker-name">{adding ? 'Adding…' : `Add “${trimmed}”`}</span>
            </button>
          </li>
        )}
        {visible.map((contact) => {
          const selected = selectedIds.includes(contact.id)
          return (
            <li key={contact.id}>
              <button type="button" role="option" aria-selected={selected} className={`contact-picker-row${selected ? ' is-selected' : ''}`} onClick={() => toggle(contact)}>
                <PersonInitials name={contact.displayName} />
                <span className="contact-picker-name">{contact.displayName}</span>
                <span className={`contact-picker-check${selected ? ' is-on' : ''}`} aria-hidden="true">
                  {selected ? '✓' : ''}
                </span>
              </button>
            </li>
          )
        })}
        {!loading && contacts.length === 0 && !trimmed && <li className="contact-picker-empty">Type a name to add the first person.</li>}
      </ul>
    </div>
  )
}
