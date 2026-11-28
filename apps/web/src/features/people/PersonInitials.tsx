import type { CSSProperties } from 'react'

/** Hues for initials circles; picked from the name so a person keeps their colour. */
const HUES = [152, 205, 250, 285, 330, 20, 45, 180]

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

function hueOf(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return HUES[hash % HUES.length]
}

/** A person's initials in a coloured circle (contacts have no photos). */
export function PersonInitials({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span className={`person-initials${size === 'lg' ? ' is-lg' : ''}`} style={{ '--person-hue': hueOf(name) } as CSSProperties} aria-hidden="true">
      {initialsOf(name)}
    </span>
  )
}
