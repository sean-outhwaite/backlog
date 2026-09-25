import type { ReactNode } from 'react'
import type { MediaType } from '../types'

// Stroke icons drawn on a 24px grid; they inherit size from font-size and colour from currentColor.
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function MediaTypeIcon({ type }: { type: MediaType }) {
  switch (type) {
    case 'movie':
      return (
        <Icon>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
        </Icon>
      )
    case 'tv':
      return (
        <Icon>
          <rect x="3" y="7" width="18" height="13" rx="2" />
          <path d="m8 3 4 4 4-4" />
        </Icon>
      )
    case 'book':
      return (
        <Icon>
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
          <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
        </Icon>
      )
    case 'game':
      return (
        <Icon>
          <path d="M6 8h12a4 4 0 0 1 4 4v1a4 4 0 0 1-7 2.6L14 14h-4l-1 1.6A4 4 0 0 1 2 13v-1a4 4 0 0 1 4-4z" />
          <path d="M7 10.5v3M5.5 12h3" />
          <circle cx="16" cy="11" r=".5" fill="currentColor" />
          <circle cx="17.5" cy="13" r=".5" fill="currentColor" />
        </Icon>
      )
  }
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M5 12.5 10 17 19 7" />
    </Icon>
  )
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  )
}

export function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Icon>
  )
}

// A little stack of cards: the backlog piling up.
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="9"
        y="3"
        width="16"
        height="21"
        rx="3"
        transform="rotate(10 17 13.5)"
        fill="currentColor"
        opacity="0.3"
      />
      <rect
        x="8"
        y="5"
        width="16"
        height="21"
        rx="3"
        transform="rotate(-5 16 15.5)"
        fill="currentColor"
        opacity="0.55"
      />
      <rect x="7" y="8" width="16" height="21" rx="3" fill="currentColor" />
      <path d="M16 8v8l2.5-1.8L21 16V8" fill="var(--bg)" />
    </svg>
  )
}
