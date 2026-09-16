import type { Account } from 'shared-types'

interface AccountSelectProps {
  accounts: Account[]
  value: string | null
  onChange: (id: string | null) => void
  placeholder?: string
}

export function AccountSelect({ accounts, value, onChange, placeholder = 'Select an account' }: AccountSelectProps) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">{placeholder}</option>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name}
        </option>
      ))}
    </select>
  )
}
