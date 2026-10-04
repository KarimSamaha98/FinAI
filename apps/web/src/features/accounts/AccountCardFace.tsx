import type { ReactNode } from 'react'
import { cardBackground } from '../../lib/cardBackground'

interface AccountCardFaceProps {
  name: string
  color: string
  photoUrl: string | null
  className?: string
  children?: ReactNode
}

/** The card-shaped preview of an account: just its photo when there is one, otherwise its colour with the name. */
export function AccountCardFace({ name, color, photoUrl, className, children }: AccountCardFaceProps) {
  return (
    <div className={['account-card-face', photoUrl ? 'has-photo' : '', className].filter(Boolean).join(' ')} style={{ background: cardBackground(color) }}>
      {photoUrl ? (
        <img src={photoUrl} alt="" className="account-card-face-photo" />
      ) : (
        <div className="account-card-face-content">{children ?? <span className="account-card-face-name">{name}</span>}</div>
      )}
    </div>
  )
}
