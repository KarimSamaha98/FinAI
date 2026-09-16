import type { HTMLAttributes } from 'react'

export type BadgeVariant = 'neutral' | 'accent'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

// Deliberately does not reuse the --series-1..8 chart palette, which is
// reserved/CVD-validated for categorical data-series encoding — a badge here
// (account type, split/reconciled status, category tag) is a different kind
// of signal and shouldn't borrow those hues.
export function Badge({ variant = 'neutral', className, ...rest }: BadgeProps) {
  return <span className={['badge', `badge-${variant}`, className].filter(Boolean).join(' ')} {...rest} />
}
