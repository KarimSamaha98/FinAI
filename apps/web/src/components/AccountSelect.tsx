import type { Account } from 'shared-types'
import { FieldSelect } from './FieldSelect'

interface AccountSelectProps {
  accounts: Account[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
  required?: boolean
}

export function AccountSelect({ accounts, value, onChange, placeholder = 'Select an account', required }: AccountSelectProps) {
  return (
    <FieldSelect
      value={value ?? ''}
      placeholder={placeholder}
      required={required}
      options={accounts.map((account) => ({ value: account.id, label: account.name }))}
      onChange={(id) => onChange(id || null)}
    />
  )
}
