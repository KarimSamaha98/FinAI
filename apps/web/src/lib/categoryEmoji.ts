/**
 * Best-effort emoji for a category name, matched by keyword since categories
 * are freeform user text with no icon field in the schema. Preset names
 * (see supabase/seed.sql) are covered exactly; custom categories fall back
 * to keyword substring matches, then a generic tag emoji.
 */
const KEYWORD_EMOJI: [string, string][] = [
  ['groceries', '🛒'],
  ['grocery', '🛒'],
  ['dining', '🍽️'],
  ['restaurant', '🍽️'],
  ['food', '🍽️'],
  ['coffee', '☕'],
  ['rent', '🏠'],
  ['mortgage', '🏠'],
  ['housing', '🏠'],
  ['utilit', '💡'],
  ['transport', '🚗'],
  ['car', '🚗'],
  ['gas', '⛽'],
  ['fuel', '⛽'],
  ['parking', '🅿️'],
  ['transit', '🚌'],
  ['uber', '🚕'],
  ['taxi', '🚕'],
  ['salary', '💰'],
  ['income', '💰'],
  ['payroll', '💰'],
  ['bonus', '💰'],
  ['transfer', '🔁'],
  ['entertain', '🎬'],
  ['movie', '🎬'],
  ['streaming', '📺'],
  ['music', '🎵'],
  ['game', '🎮'],
  ['health', '💊'],
  ['medical', '💊'],
  ['pharmacy', '💊'],
  ['doctor', '🩺'],
  ['fitness', '🏋️'],
  ['gym', '🏋️'],
  ['shopping', '🛍️'],
  ['clothes', '👕'],
  ['clothing', '👕'],
  ['travel', '✈️'],
  ['flight', '✈️'],
  ['hotel', '🏨'],
  ['vacation', '🏖️'],
  ['insurance', '🛡️'],
  ['subscription', '🔔'],
  ['reimburse', '💸'],
  ['invest', '📈'],
  ['stock', '📈'],
  ['crypto', '📈'],
  ['education', '🎓'],
  ['school', '🎓'],
  ['tuition', '🎓'],
  ['book', '📚'],
  ['gift', '🎁'],
  ['donat', '❤️'],
  ['charity', '❤️'],
  ['pet', '🐾'],
  ['kid', '🧒'],
  ['child', '🧒'],
  ['baby', '🧒'],
  ['phone', '📱'],
  ['internet', '🌐'],
  ['electronic', '🔌'],
  ['tax', '🧾'],
  ['other', '🏷️'],
]

export function categoryEmoji(name: string | null | undefined): string {
  if (!name) return '❔'
  const lower = name.toLowerCase()
  for (const [keyword, emoji] of KEYWORD_EMOJI) {
    if (lower.includes(keyword)) return emoji
  }
  return '🏷️'
}
