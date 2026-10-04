import type { AccountType } from 'shared-types'

export const ACCOUNT_TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'credit', label: 'Credit' },
  { value: 'investment', label: 'Investment' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
]

export function accountTypeLabel(type: AccountType): string {
  return ACCOUNT_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
}
