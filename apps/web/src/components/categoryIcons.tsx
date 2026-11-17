import type { ReactNode, SVGProps } from 'react'
import type { CategoryIconKey } from 'shared-types'
import { DEFAULT_CATEGORY_ICON } from '../lib/categoryIconKeys'

const PATHS: Record<CategoryIconKey, ReactNode> = {
  cart: (
    <>
      <circle cx="9.5" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M3 4h2l2.5 11.3a1 1 0 0 0 1 .7h8.3a1 1 0 0 0 1-.8L21 8H6" />
    </>
  ),
  utensils: (
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Z" />
      <path d="M21 15v7" />
    </>
  ),
  coffee: (
    <>
      <path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" />
      <path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2" />
      <path d="M8 3v2M12 3v2M16 3v2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.8V20h12V9.8" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6Z" />,
  droplet: <path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3Z" />,
  flame: (
    <>
      <path d="M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-1.6.8-2.9 1.6-4.2" />
      <path d="M12 21a3 3 0 0 0 3-3c0-1.5-1-2.6-3-5-2 2.4-3 3.5-3 5a3 3 0 0 0 3 3Z" />
    </>
  ),
  wifi: (
    <>
      <path d="M3 9a15 15 0 0 1 18 0" />
      <path d="M6 12.5a10 10 0 0 1 12 0" />
      <path d="M9 16a5 5 0 0 1 6 0" />
      <path d="M12 19.5v.01" strokeWidth="2.6" />
    </>
  ),
  phone: (
    <>
      <rect x="7" y="3" width="10" height="18" rx="2.5" />
      <path d="M11 18h2" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v-4h3l2.3-3.5A1.6 1.6 0 0 1 10.6 7.7h2.8a1.6 1.6 0 0 1 1.4.8L17 12h3v4" />
      <path d="M4 16h16" />
      <circle cx="7.5" cy="16" r="1.7" />
      <circle cx="16.5" cy="16" r="1.7" />
    </>
  ),
  fuel: (
    <>
      <path d="M6 21V4h7v17" />
      <path d="M6 9h7" />
      <path d="M13 6h2.4a2 2 0 0 1 2 2v6.5a1.5 1.5 0 0 0 3 0V9l-2.4-2.6" />
    </>
  ),
  bus: (
    <>
      <rect x="5" y="4" width="14" height="12" rx="2.5" />
      <path d="M5 10h14" />
      <circle cx="8.5" cy="18.5" r="1.4" />
      <circle cx="15.5" cy="18.5" r="1.4" />
    </>
  ),
  plane: <path d="M11 3.5a1 1 0 0 1 2 0V9l7 4v2l-7-2v4l2 1.5V20l-3.5-1L9 20v-1.5L11 17v-4l-7 2v-2l7-4Z" />,
  bag: (
    <>
      <path d="M6 8h12l-1 12H7Z" />
      <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
    </>
  ),
  shirt: <path d="M9 4 6 6l2 3 1-1v11h6V8l1 1 2-3-3-2-3 2Z" />,
  heart: <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  pill: (
    <>
      <rect x="4" y="9" width="16" height="6.5" rx="3.25" transform="rotate(-45 12 12)" />
      <path d="M9.4 8.6l6 6" />
    </>
  ),
  dumbbell: (
    <>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
      <path d="M7 12h10" />
    </>
  ),
  shield: <path d="M12 3 5 6v5c0 4.6 3 8.2 7 10 4-1.8 7-5.4 7-10V6Z" />,
  film: (
    <>
      <rect x="2" y="2" width="20" height="20" rx="2.2" />
      <path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V5l10-2v12" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="15" r="2" />
    </>
  ),
  gamepad: (
    <>
      <rect x="3" y="8" width="18" height="9" rx="4.5" />
      <path d="M8 11v3M6.5 12.5h3" />
      <circle cx="16" cy="11.5" r="1" />
      <circle cx="18" cy="14" r="1" />
    </>
  ),
  book: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2Z" />
      <path d="M20 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2Z" />
    </>
  ),
  'graduation-cap': (
    <>
      <path d="M2 9l10-4 10 4-10 4Z" />
      <path d="M6 11v4c0 1.5 2.7 3 6 3s6-1.5 6-3v-4" />
      <path d="M22 9v4" />
    </>
  ),
  wallet: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1" />
    </>
  ),
  banknote: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6.5 9v6M17.5 9v6" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 9h13l-3-3" />
      <path d="M20 15H7l3 3" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3.5 20 6.5l-3 3" />
      <path d="M20 6.5H8a4 4 0 0 0-4 4v1" />
      <path d="M7 20.5 4 17.5l3-3" />
      <path d="M4 17.5h12a4 4 0 0 0 4-4v-1" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 21Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  'trending-up': (
    <>
      <path d="M4 16l5-5 3 3 6-7" />
      <path d="M16 7h4v4" />
    </>
  ),
  'piggy-bank': (
    <>
      <path d="M4 13a5 5 0 0 1 5-5h5a5 5 0 0 1 4.5 2.9H20v3h-1.6A5 5 0 0 1 14 17H9a5 5 0 0 1-5-4Z" />
      <path d="M8 8V6M14 8V6M8.5 17v2M15 17v2" />
      <circle cx="9.5" cy="12" r=".7" />
    </>
  ),
  gift: (
    <>
      <rect x="4" y="9" width="16" height="11" rx="1.5" />
      <path d="M12 9v11M4 13h16" />
      <path d="M12 9C10.4 9 8 8.3 8 6.6A1.9 1.9 0 0 1 12 6a1.9 1.9 0 0 1 4 .6C16 8.3 13.6 9 12 9Z" />
    </>
  ),
  paw: (
    <>
      <circle cx="7" cy="10" r="1.7" />
      <circle cx="11" cy="7.2" r="1.7" />
      <circle cx="16" cy="8" r="1.7" />
      <circle cx="19" cy="11.5" r="1.7" />
      <path d="M12 20c-3 0-5-1.5-5-3.6S9.2 13 12 13s5 1.3 5 3.4S15 20 12 20Z" />
    </>
  ),
  baby: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  'hand-heart': (
    <>
      <path d="M3 15h3l3 1.8 3-1 3 1.2 4-2" />
      <path d="M12 11.5a2.4 2.4 0 0 1-3.5-3.2C9.5 6.6 12 5.5 12 5.5s2.5 1.1 3.5 2.8A2.4 2.4 0 0 1 12 11.5Z" />
      <path d="M3 15v5h4" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M8 7.5 20 18M8 16.5 20 6" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z" />
    </>
  ),
  tool: <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94Z" />,
  laundry: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <circle cx="12" cy="13.5" r="4" />
      <path d="M8.5 6.5h.01M11.5 6.5h.01" strokeWidth="2.4" />
    </>
  ),
  laptop: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="1.6" />
      <path d="M2 19h20" />
    </>
  ),
  dots: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeWidth="2.6" />
    </>
  ),
  tag: (
    <>
      <path d="M4 12V5a1 1 0 0 1 1-1h7l8 8-8 8Z" />
      <circle cx="8.3" cy="8.3" r="1.2" />
    </>
  ),
}

interface CategoryIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: CategoryIconKey | null | undefined
  size?: number
}

/** Renders a category icon by key; unknown/null falls back to the "tag" glyph. */
export function CategoryIcon({ name, size = 14, ...rest }: CategoryIconProps) {
  const key = name && name in PATHS ? name : DEFAULT_CATEGORY_ICON
  return (
    <svg
      width={size}
      height={size}
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
      {PATHS[key]}
    </svg>
  )
}
