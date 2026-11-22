import { usePrivacy } from '../context/PrivacyContext'
import { EyeIcon, EyeOffIcon } from './icons'

interface PrivacyToggleProps {
  className?: string
}

/** A round eye button beside a balance: hides or shows balances app-wide (every instance flips the same setting). */
export function PrivacyToggle({ className }: PrivacyToggleProps) {
  const { hidden, toggle } = usePrivacy()
  const label = hidden ? 'Show balances' : 'Hide balances'
  return (
    <button
      type="button"
      className={['privacy-toggle', className].filter(Boolean).join(' ')}
      // Pressed = privacy on.
      aria-pressed={hidden}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {hidden ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}
