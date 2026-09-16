import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
}

export function Button({ variant = 'secondary', loading, disabled, children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={['btn', `btn-${variant}`, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {loading ? 'Working…' : children}
    </button>
  )
}
