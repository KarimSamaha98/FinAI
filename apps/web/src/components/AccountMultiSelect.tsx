import type { Account } from 'shared-types'
import { MultiSelectDropdown } from './MultiSelectDropdown'

interface AccountMultiSelectProps {
  accounts: Account[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
}

export function AccountMultiSelect({ accounts, selectedIds, onChange }: AccountMultiSelectProps) {
  return (
    <MultiSelectDropdown
      label="Account"
      options={accounts.map((a) => ({ id: a.id, label: a.name }))}
      selectedIds={selectedIds}
      onChange={onChange}
    />
  )
}
