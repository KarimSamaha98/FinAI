import type { PersonSummary } from 'shared-types'
import { formatCurrency } from '../../lib/formatCurrency'

export type PersonStatusTone = 'owed' | 'owe' | 'settled'

/** One status per person: they owe the user, the user owes them, or settled up. */
export function personStatus(person: Pick<PersonSummary, 'net'>): { label: string; tone: PersonStatusTone } {
  if (person.net > 0) return { label: 'Owes you', tone: 'owed' }
  if (person.net < 0) return { label: 'You owe', tone: 'owe' }
  return { label: 'Settled up', tone: 'settled' }
}

/** A signed balance in words: "owes you $5.00", "you owe $5.00", "settled". */
export function balanceText(amount: number, currencyCode: string): string {
  if (amount > 0) return `owes you ${formatCurrency(amount, currencyCode)}`
  if (amount < 0) return `you owe ${formatCurrency(-amount, currencyCode)}`
  return 'settled'
}

/** "In USD: owes you $29.00 · In CAD: you owe $14.11" — only when more than the home currency is involved. */
export function balancesDetail(person: PersonSummary): string | null {
  const { balances, homeCurrencyCode } = person
  if (balances.length === 0 || (balances.length === 1 && balances[0].currencyCode === homeCurrencyCode)) return null
  return balances.map((b) => `In ${b.currencyCode}: ${balanceText(b.amount, b.currencyCode)}`).join(' · ')
}
