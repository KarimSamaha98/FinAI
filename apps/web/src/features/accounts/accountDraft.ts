import { useEffect, useMemo, useState } from 'react'
import type { AccountSummary, AccountType, CreateAccountInput } from 'shared-types'
import { useProfile } from '../../hooks/useProfile'
import { defaultCsvImport } from '../../lib/accountTypes'
import { MAX_CARD_PHOTO_BYTES } from './CardAppearanceEditor'

/** The steps of creating an account (Add account's Created result screen follows them). */
export const ACCOUNT_STEPS = [
  { key: 'details', label: 'Details' },
  { key: 'balance', label: 'Balance' },
  { key: 'card', label: 'Card' },
  { key: 'csv', label: 'CSV import' },
] as const
export type AccountStepKey = (typeof ACCOUNT_STEPS)[number]['key']

interface AccountDraftOptions {
  defaultCardColor: string
}

/** Everything typed into the new-account steps, plus validation and the create call. */
export function useAccountDraft({ defaultCardColor }: AccountDraftOptions) {
  const { profile } = useProfile()
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('checking')
  const [institution, setInstitution] = useState('')
  // null until chosen: follows the home currency once the profile loads.
  const [chosenCurrency, setCurrencyCode] = useState<string | null>(null)
  const [startingBalance, setStartingBalance] = useState('0')
  const [balanceAsOf, setBalanceAsOf] = useState(new Date().toISOString().slice(0, 10))
  const [cardColor, setCardColor] = useState(defaultCardColor)
  const [cardPhoto, setCardPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  // null until answered: follows the type (cash → no, others → yes).
  const [chosenCsvImport, setCsvImportEnabled] = useState<boolean | null>(null)

  const currencyCode = chosenCurrency ?? profile?.homeCurrencyCode ?? 'USD'
  const csvImportEnabled = chosenCsvImport ?? defaultCsvImport(type)

  const cardPhotoUrl = useMemo(() => (cardPhoto ? URL.createObjectURL(cardPhoto) : null), [cardPhoto])
  useEffect(
    () => () => {
      if (cardPhotoUrl) URL.revokeObjectURL(cardPhotoUrl)
    },
    [cardPhotoUrl],
  )

  function selectPhoto(file: File) {
    if (file.size > MAX_CARD_PHOTO_BYTES) {
      setPhotoError('Card photo must be 5 MB or smaller')
      return
    }
    setPhotoError(null)
    setCardPhoto(file)
  }

  const balanceNumber = Number(startingBalance)
  const valid: Record<AccountStepKey, boolean> = {
    details: name.trim() !== '',
    balance: startingBalance.trim() !== '' && Number.isFinite(balanceNumber) && !!balanceAsOf,
    card: true,
    csv: true,
  }
  const dirty = name.trim() !== '' || institution.trim() !== '' || cardPhoto !== null

  /** Creates the account, then uploads the photo (a failed photo doesn't undo the account). */
  async function create(
    createAccount: (input: CreateAccountInput) => Promise<AccountSummary>,
    uploadCardImage: (accountId: string, file: File) => Promise<void>,
  ): Promise<AccountSummary> {
    const input: CreateAccountInput = {
      name: name.trim(),
      type,
      institution: institution.trim() || null,
      currencyCode,
      startingBalance: balanceNumber,
      balanceAsOf,
      cardColor,
      csvImportEnabled,
    }
    const account = await createAccount(input)
    if (cardPhoto) {
      try {
        await uploadCardImage(account.id, cardPhoto)
      } catch {
        // The account exists either way — the photo can be added again from its settings.
      }
    }
    return account
  }

  return {
    name,
    setName,
    type,
    setType,
    institution,
    setInstitution,
    currencyCode,
    setCurrencyCode,
    startingBalance,
    setStartingBalance,
    balanceAsOf,
    setBalanceAsOf,
    cardColor,
    setCardColor,
    cardPhotoUrl,
    selectPhoto,
    removePhoto: () => setCardPhoto(null),
    photoError,
    csvImportEnabled,
    setCsvImportEnabled,
    valid,
    dirty,
    create,
  }
}

export type AccountDraft = ReturnType<typeof useAccountDraft>

export const ACCOUNT_STEP_QUESTIONS: Record<AccountStepKey, { title: string; hint?: string }> = {
  details: { title: 'What’s this account called?', hint: 'The name shows on its card and in your transactions.' },
  balance: { title: 'What’s in it right now?' },
  card: { title: 'Choose how its card looks', hint: 'A photo of your card, or a colour. You can change this later in settings.' },
  csv: { title: 'Can you download this account’s transactions as a CSV?', hint: 'You can change this anytime in the account’s settings.' },
}

/** Steps through the account steps, creating the account on the last one. */
export function useAccountCreateSteps(
  draft: AccountDraft,
  createAccount: (input: CreateAccountInput) => Promise<AccountSummary>,
  uploadCardImage: (accountId: string, file: File) => Promise<void>,
  onCreated: (account: AccountSummary) => void,
) {
  const [index, setIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const step = ACCOUNT_STEPS[index].key

  async function next() {
    setError(null)
    if (!draft.valid[step]) return
    if (index < ACCOUNT_STEPS.length - 1) {
      setIndex(index + 1)
      return
    }
    setCreating(true)
    try {
      onCreated(await draft.create(createAccount, uploadCardImage))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setCreating(false)
    }
  }

  return {
    step,
    isFirst: index === 0,
    next,
    /** One step back; does nothing on the first step (the caller decides where Back goes). */
    previous: () => setIndex(Math.max(0, index - 1)),
    reset: () => setIndex(0),
    creating,
    error,
  }
}
