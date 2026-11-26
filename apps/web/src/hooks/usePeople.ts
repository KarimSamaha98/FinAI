import type { Contact, PeopleSummary, PersonDetail, RecordCashInput, TransactionPeople, TransactionSplit, TransactionSplitInput } from 'shared-types'
import { apiClient } from '../lib/apiClient'
import { invalidateApi } from '../lib/queryClient'
import { useApiQuery } from './useApiQuery'

const NO_CONTACTS: Contact[] = []

/** Everyone with activity and their balance (Home's People table). */
export function usePeople() {
  const { data, loading, error, refresh } = useApiQuery<PeopleSummary>('/people', { errorMessage: 'Failed to load people' })
  return { people: data ?? null, loading, error, refresh }
}

export function usePerson(contactId: string | null) {
  const { data, loading, error, refresh } = useApiQuery<PersonDetail>(contactId ? `/people/${contactId}` : null, {
    errorMessage: 'Failed to load this person',
  })
  return { person: data ?? null, loading, error, refresh }
}

export function useContacts() {
  const { data, loading, error } = useApiQuery<Contact[]>('/contacts', { errorMessage: 'Failed to load people' })
  return { contacts: data ?? NO_CONTACTS, loading, error }
}

/** How one transaction is shared with people (split is null when it isn't). */
export function useTransactionPeople(transactionId: string | null) {
  const { data, loading, error } = useApiQuery<TransactionPeople>(transactionId ? `/people/splits/${transactionId}` : null, {
    errorMessage: 'Failed to load who this is shared with',
  })
  return { details: data ?? null, loading, error }
}

/** Every change can move net worth, the ledger and Home, so each one refreshes all reads. */
async function mutate<T>(request: Promise<T>): Promise<T> {
  const result = await request
  await invalidateApi()
  return result
}

export const peopleApi = {
  createContact: (displayName: string) => mutate(apiClient.post<Contact>('/contacts', { displayName })),
  renameContact: (id: string, displayName: string) => mutate(apiClient.patch<Contact>(`/contacts/${id}`, { displayName })),
  deleteContact: (id: string) => mutate(apiClient.delete<void>(`/contacts/${id}`)),
  setSplit: (transactionId: string, input: TransactionSplitInput) => mutate(apiClient.put<TransactionSplit>(`/people/splits/${transactionId}`, input)),
  deleteSplit: (transactionId: string) => mutate(apiClient.delete<void>(`/people/splits/${transactionId}`)),
  recordCash: (contactId: string, input: RecordCashInput) => mutate(apiClient.post<void>(`/people/${contactId}/cash`, input)),
  settleUp: (contactId: string) => mutate(apiClient.post<void>(`/people/${contactId}/settle-up`)),
  deleteEntry: (entryId: string) => mutate(apiClient.delete<void>(`/people/entries/${entryId}`)),
}

/** The server's message from an API error ("API 409 /path: {json}"), or a fallback. */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback
  const json = error.message.slice(error.message.indexOf('{'))
  try {
    const parsed = JSON.parse(json) as { message?: string | string[] }
    if (Array.isArray(parsed.message)) return parsed.message.join(', ')
    if (parsed.message) return parsed.message
  } catch {
    // Not a JSON body; fall through.
  }
  return fallback
}
