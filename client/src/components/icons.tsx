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

export function SeriesIcon() {
  return (
    <Icon>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Icon>
  )
}

export function CheckIcon() {
  return (
    <Icon>
      {/* pathLength lets CSS draw the tick in (stroke-dashoffset 1 → 0). */}
      <path d="M5 12.5 10 17 19 7" pathLength={1} />
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

export function LogOutIcon() {
  return (
    <Icon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
    </Icon>
  )
}

export function CameraIcon() {
  return (
    <Icon>
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <circle cx="12" cy="13" r="3.5" />
    </Icon>
  )
}

export function BellIcon() {
  return (
    <Icon>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Icon>
  )
}

export function BookmarkIcon() {
  return (
    <Icon>
      <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z" />
    </Icon>
  )
}

export function StarIcon() {
  return (
    <Icon>
      <path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
    </Icon>
  )
}

export function CalendarIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Icon>
  )
}

export function PencilIcon() {
  return (
    <Icon>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
    </Icon>
  )
}

export function PlayIcon() {
  return (
    <Icon>
      <path className="play-shape" d="M7 4v16l13-8z" fill="currentColor" />
    </Icon>
  )
}

export function UndoIcon() {
  return (
    <Icon>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </Icon>
  )
}

export function TrashIcon() {
  return (
    <Icon>
      <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Icon>
  )
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  )
}

export function ChevronLeftIcon() {
  return (
    <Icon>
      <path d="m15 18-6-6 6-6" />
    </Icon>
  )
}

export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="m9 18 6-6-6-6" />
    </Icon>
  )
}

export function MoreIcon() {
  return (
    <Icon>
      <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth="3" />
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

export function ListIcon() {
  return (
    <Icon>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="m3.5 6 1.5 1.5L7.5 5M3.5 12l1.5 1.5L7.5 11" />
      <circle cx="5" cy="18" r="1" />
    </Icon>
  )
}

export function UsersIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.5A6.5 6.5 0 0 1 21.5 20" />
    </Icon>
  )
}

export function SparklesIcon() {
  return (
    <Icon>
      <path d="M10 3.5 11.8 8.2 16.5 10l-4.7 1.8L10 16.5l-1.8-4.7L3.5 10l4.7-1.8z" />
      <path d="M18 14v6M15 17h6" />
    </Icon>
  )
}

// A campfire: logs on the fire, the backlog. The flame flickers and smokes on hover (see .logo-flame).
export function LogoMark() {
  return (
    <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true">
      <g className="logo-smoke">
        <circle cx="16" cy="5" r="1.6" />
        <circle cx="16" cy="5" r="1.6" />
        <circle cx="16" cy="5" r="1.6" />
      </g>
      <g className="logo-flame">
        <path
          d="M16 2.5c3 4.6 7.6 7.8 7 14-.4 4-3.4 6.8-7 6.8s-6.6-2.8-7-6.8c-.3-3.4 1.6-5.6 3.2-7.6.3 2.2 1.2 3.4 2.3 4C14 9.4 14.6 5.8 16 2.5Z"
          fill="currentColor"
        />
        <path
          d="M16 10.5c2 3 3.9 5 3.6 8.3-.2 2.4-1.7 3.7-3.6 3.7s-3.4-1.3-3.6-3.4c-.2-2.3 1.3-3.6 2.2-5 .4 1.3 1 1.8 1.5 2-.5-1.8-.6-3.6-.1-5.6Z"
          fill="var(--flame-core)"
        />
      </g>
      <circle cx="24.5" cy="6.5" r="1" fill="var(--flame-core)" opacity="0.8" />
      <circle cx="7.5" cy="9" r="0.75" fill="currentColor" opacity="0.6" />
      <g fill="var(--log)">
        <rect x="4" y="22" width="24" height="5" rx="2.5" transform="rotate(-12 16 24.5)" />
        <rect x="4" y="22" width="24" height="5" rx="2.5" transform="rotate(12 16 24.5)" />
      </g>
      <g fill="none" stroke="var(--flame-core)" strokeWidth="0.9" opacity="0.55">
        <circle cx="6.8" cy="22.5" r="1.2" />
        <circle cx="25.2" cy="22.5" r="1.2" />
      </g>
    </svg>
  )
}

export function SendIcon() {
  return (
    <Icon>
      <path d="M21 3 10 14" />
      <path d="m21 3-6.5 18-4.5-7-7-4.5z" />
    </Icon>
  )
}

export function UserMinusIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 11h6" />
    </Icon>
  )
}

export function RefreshIcon() {
  return (
    <Icon>
      <path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" />
      <path d="M4 3v5h5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" />
      <path d="M20 21v-5h-5" />
    </Icon>
  )
}
