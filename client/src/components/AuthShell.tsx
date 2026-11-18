import type { ReactNode } from 'react'
import { LogoMark, MediaTypeIcon } from './icons'

// Centered card for the signed-out screens, with the four media types drifting in the background.
// With an aside (the sign-in page's showcase), the card and aside sit side by side on wide screens
// and stack on narrow ones, and the floaters are left out since there's no empty space for them.
export function AuthShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className={aside ? 'auth-page auth-page--split' : 'auth-page'}>
      {!aside && (
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
      )}
      <div className="auth-card">
        <LogoMark />
        {children}
      </div>
      {aside}
    </div>
  )
}
