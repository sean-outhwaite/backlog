import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { LogOutIcon } from './icons'

// Avatar button in the header; sign out lives behind it so it's not one stray click away.
export function UserMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="user-menu-trigger"
        aria-expanded={open}
        aria-controls="user-menu-panel"
        aria-label={`Account menu for ${profile?.username ?? 'you'}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="avatar" aria-hidden="true">
          {profile?.username?.[0]?.toUpperCase()}
        </span>
        <span className="app-username">{profile?.username}</span>
        <svg className="icon user-menu-chevron" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div className="user-menu-panel" id="user-menu-panel">
          <p className="user-menu-signed-in">
            Signed in as <strong>{profile?.username}</strong>
          </p>
          <button className="user-menu-item btn-quiet" onClick={() => void signOut()} autoFocus>
            <LogOutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}
