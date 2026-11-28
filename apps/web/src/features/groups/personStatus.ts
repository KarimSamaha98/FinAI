import { formatCurrency } from '../../lib/formatCurrency'

/** Under the name: what's paid, what's still expected. */
export function personStatusText(share: number, paid: number, forgiven: number, outstanding: number, currencyCode: string): string {
  const theyOwe = share > 0
  if (outstanding === 0) {
    if (forgiven !== 0 && paid === 0) return 'Forgiven'
    return theyOwe ? 'Paid' : 'You paid them'
  }
  const left = formatCurrency(Math.abs(outstanding), currencyCode)
  if (paid !== 0 || forgiven !== 0) return theyOwe ? `${left} still expected` : `You still owe ${left}`
  return theyOwe ? 'Expected payment' : 'You owe them'
}
