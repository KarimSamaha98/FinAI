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
