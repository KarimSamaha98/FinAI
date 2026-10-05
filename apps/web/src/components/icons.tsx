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
