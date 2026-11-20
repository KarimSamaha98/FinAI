/** The CSV profile questions, in order. Each is its own step in the profile wizard's progress bar. */
export const PROFILE_QUESTIONS = ['header', 'description', 'date', 'layout', 'amounts', 'money', 'preview'] as const
export type ProfileQuestion = (typeof PROFILE_QUESTIONS)[number]

export const PROFILE_QUESTION_LABELS: Record<ProfileQuestion, string> = {
  header: 'Column names',
  description: 'Description',
  date: 'Date',
  layout: 'Amount layout',
  amounts: 'Amount columns',
  money: 'Money in/out',
  preview: 'Preview',
}
