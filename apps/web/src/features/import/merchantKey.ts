/**
 * The merchant part of a description, without store numbers, reference codes
 * and a trailing "CITY, ON" location, in the original casing:
 * "STARBUCKS #9845 WATERLOO, ON" → "STARBUCKS". Deliberately simple: anything
 * it can't strip keeps rows apart, which errs on the side of asking twice
 * rather than mislabelling. Falls back to the whole description.
 */
export function merchantName(description: string): string {
  let text = description.trim()
  // "…, ON": a location. Drop the region code and the city word before it
  // (when something is left besides the city).
  const location = text.match(/^(.*\S)\s+(\S+),\s*[A-Za-z]{2}\s*$/)
  if (location) text = location[1]
  else text = text.replace(/,\s*[A-Za-z]{2}\s*$/, '')

  const name = text
    // "#1812", "*TRIP4F2K"-style codes.
    .replace(/[#*]\S*/g, ' ')
    .split(/\s+/)
    // Tokens with digits are reference numbers, phone numbers, dates.
    .filter((token) => token && !/\d/.test(token))
    .map((token) => token.replace(/[^\p{L}&'./-]/gu, ''))
    .filter(Boolean)
    .join(' ')
  return name || description.trim()
}

/** A loose key for "same merchant", so "STARBUCKS #9845 WATERLOO, ON" and "Starbucks #3901 Kitchener, ON" group together. */
export function merchantKey(description: string): string {
  return merchantName(description).toLowerCase()
}
