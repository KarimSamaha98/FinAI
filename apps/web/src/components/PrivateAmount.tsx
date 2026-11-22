import type { CSSProperties } from 'react'
import { usePrivacy } from '../context/PrivacyContext'
import { currencySymbol, formatCurrency, PRIVATE_DOTS } from '../lib/formatCurrency'

interface PrivateAmountProps {
  amount: number
  currencyCode: string
  className?: string
  /** Applied only while revealed (e.g. the net worth's sign colour). */
  revealedStyle?: CSSProperties
  /** Applied hidden or revealed (e.g. Home's account balance colours, kept on purpose). */
  style?: CSSProperties
}

/** A holding (balance, net worth): the formatted amount, or a mask in privacy mode. */
export function PrivateAmount({ amount, currencyCode, className, revealedStyle, style }: PrivateAmountProps) {
  const { hidden } = usePrivacy()
  if (hidden) {
    return (
      <span className={[className, 'is-private'].filter(Boolean).join(' ')} style={style} aria-label="Hidden amount">
        {currencySymbol(currencyCode)}
        {/* Dots scaled to the text, not letter-sized discs. */}
        <span className="private-dots" aria-hidden="true">
          {PRIVATE_DOTS}
        </span>
      </span>
    )
  }
  return (
    <span className={className} style={{ ...style, ...revealedStyle }}>
      {formatCurrency(amount, currencyCode)}
    </span>
  )
}
