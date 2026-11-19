/** The CSV profile questions, in order. Each is its own step in the profile wizard's progress bar. */
export const PROFILE_QUESTIONS = ['header', 'currency', 'date', 'description', 'amounts', 'save'] as const
export type ProfileQuestion = (typeof PROFILE_QUESTIONS)[number]

export const PROFILE_QUESTION_LABELS: Record<ProfileQuestion, string> = {
  header: 'Header row',
  currency: 'Currency',
  date: 'Date',
  description: 'Description',
  amounts: 'Amounts',
  save: 'Review',
}
