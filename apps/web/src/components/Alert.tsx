import type { HTMLAttributes } from 'react'

export type AlertVariant = 'error' | 'success' | 'info'

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant
}

export function Alert({ variant = 'info', className, ...rest }: AlertProps) {
  return <div className={['alert', `alert-${variant}`, className].filter(Boolean).join(' ')} {...rest} />
}
