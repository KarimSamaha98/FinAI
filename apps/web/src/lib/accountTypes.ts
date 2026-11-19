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

/**
 * The pre-selected answer to "Can you download this account's transactions as
 * a CSV?" when adding an account. Cash has nothing to export; everything else
 * usually does. The answer is stored on the account (csvImportEnabled).
 */
export function defaultCsvImport(type: AccountType): boolean {
  return type !== 'cash'
}
