import type { ReactNode } from 'react'
import { LogoMark, MediaTypeIcon } from './icons'

// Centered card for the signed-out screens, with the four media types drifting in the background.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      <div className="auth-floaters" aria-hidden="true">
        <span className="floater floater--1">
          <MediaTypeIcon type="movie" />
        </span>
        <span className="floater floater--2">
          <MediaTypeIcon type="book" />
        </span>
        <span className="floater floater--3">
          <MediaTypeIcon type="game" />
        </span>
        <span className="floater floater--4">
          <MediaTypeIcon type="tv" />
        </span>
      </div>
      <div className="auth-card">
        <LogoMark />
        {children}
      </div>
    </div>
  )
}
