const formatterCache = new Map<string, Intl.NumberFormat>()

function formatterFor(currencyCode: string): Intl.NumberFormat {
  let formatter = formatterCache.get(currencyCode)
  if (!formatter) {
    formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode })
    formatterCache.set(currencyCode, formatter)
  }
  return formatter
}

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return formatterFor(currencyCode).format(amount)
  } catch {
    // Unknown/malformed currency code — fall back to a plain numeric label
    // rather than throwing, since this is only ever used for display.
    return `${amount.toFixed(2)} ${currencyCode}`
  }
}

export const PRIVATE_DOTS = '••••••'

/** The currency's symbol as formatCurrency shows it ("CA$", "€"), or the code if unknown. */
export function currencySymbol(currencyCode: string): string {
  try {
    const parts = formatterFor(currencyCode).formatToParts(0)
    return parts.find((part) => part.type === 'currency')?.value ?? currencyCode
  } catch {
    return currencyCode
  }
}

/**
 * A hidden amount: the currency symbol and a fixed run of dots ("CA$ ••••••").
 * The same for every value, with no sign, so nothing about the amount leaks.
 */
export function maskedCurrency(currencyCode: string): string {
  return `${currencySymbol(currencyCode)} ${PRIVATE_DOTS}`
}
