import type { SVGProps } from 'react'

// Decorative inline stroke icons for the app chrome (no icon dependency).
// aria-hidden everywhere — every rail link carries its own aria-label, so
// the accessible name never depends on the icon.

function Icon({ children, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function HomeIcon() {
  return (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-5.5h5V21" />
    </Icon>
  )
}

export function TransactionIcon() {
  return (
    <Icon>
      <path d="M7.5 4.5v15" />
      <path d="m3.5 15.5 4 4 4-4" />
      <path d="M16.5 19.5v-15" />
      <path d="m12.5 8.5 4-4 4 4" />
    </Icon>
  )
}

export function InsightsIcon() {
  return (
    <Icon>
      <path d="M4 21h16" />
      <path d="M7 21v-7" />
      <path d="M12 21V9" />
      <path d="M17 21V4" />
    </Icon>
  )
}

export function SettingsIcon() {
  return (
    <Icon>
      <path d="M4 6h16" />
      <circle cx="9" cy="6" r="2.4" />
      <path d="M4 12h16" />
      <circle cx="15" cy="12" r="2.4" />
      <path d="M4 18h16" />
      <circle cx="7" cy="18" r="2.4" />
    </Icon>
  )
}

export function LogoutIcon() {
  return (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Icon>
  )
}

export function MenuIcon() {
  return (
    <Icon width="22" height="22">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </Icon>
  )
}

export function CloseIcon() {
  return (
    <Icon width="22" height="22">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </Icon>
  )
}

export function ChevronLeftIcon() {
  return (
    <Icon width="24" height="24" strokeWidth="2.4">
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </Icon>
  )
}

export function InfoIcon() {
  return (
    <Icon width="22" height="22">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <path d="M12 7.6v.01" strokeWidth="2.6" />
    </Icon>
  )
}

export function ChevronRightIcon() {
  return (
    <Icon width="22" height="22" strokeWidth="2.2">
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Icon>
  )
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Icon>
  )
}

export function ArrowUpIcon() {
  return (
    <Icon>
      <path d="M12 19V5" />
      <path d="m6 11 6-6 6 6" />
    </Icon>
  )
}

export function ArrowDownIcon() {
  return (
    <Icon>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </Icon>
  )
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="m6 9.5 6 6 6-6" />
    </Icon>
  )
}

export function SplitIcon() {
  return (
    <Icon>
      <path d="M17 3.5 20 6.5l-3 3" />
      <path d="M20 6.5H7a4 4 0 0 0-4 4v1" />
      <path d="M7 20.5 4 17.5l3-3" />
      <path d="M4 17.5h13a4 4 0 0 0 4-4v-1" />
    </Icon>
  )
}

export function LinkIcon() {
  return (
    <Icon>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Icon>
  )
}

/** Six-dot grip: the "drag to arrange" handle. */
export function GripIcon() {
  return (
    <Icon>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth="2.8" />
    </Icon>
  )
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
      <path d="m14.5 5.5 3 3" />
    </Icon>
  )
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </Icon>
  )
}

export function LockIcon() {
  return (
    <Icon>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" />
    </Icon>
  )
}

export function BankIcon() {
  return (
    <Icon>
      <path d="M3 9 12 4l9 5" />
      <path d="M5 9v8M19 9v8M9.5 9v8M14.5 9v8" />
      <path d="M3 21h18" />
    </Icon>
  )
}

export function UnlockIcon() {
  return (
    <Icon>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M7.5 10.5V8a4.5 4.5 0 0 1 8.3-2.5" />
    </Icon>
  )
}

export function CreditCardIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <path d="M3 10h18" />
      <path d="M7 14h4" />
    </Icon>
  )
}

export function InvestmentIcon() {
  return (
    <Icon>
      <path d="M4 17l5-5 3 3 6-7" />
      <path d="M16 8h4v4" />
    </Icon>
  )
}

export function CashIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9v6M17.5 9v6" />
    </Icon>
  )
}

export function AccountIcon() {
  return (
    <Icon>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <circle cx="12" cy="12" r="2" />
    </Icon>
  )
}
