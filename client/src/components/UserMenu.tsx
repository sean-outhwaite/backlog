import { useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { usePopover } from '../hooks/usePopover'
import { Avatar } from './Avatar'
import { AvatarDialog } from './AvatarDialog'
import { CameraIcon, LogOutIcon } from './icons'

// Avatar button in the header; sign out lives behind it so it's not one stray click away.
export function UserMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const [editingPhoto, setEditingPhoto] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  usePopover(open, setOpen, rootRef, triggerRef)

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
        <Avatar profile={profile} />
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
          <button
            className="user-menu-item btn-quiet"
            onClick={() => {
              setOpen(false)
              setEditingPhoto(true)
            }}
            autoFocus
          >
            <CameraIcon />
            {profile?.avatarUrl ? 'Change photo' : 'Add a photo'}
          </button>
          <button className="user-menu-item btn-quiet" onClick={() => void signOut()}>
            <LogOutIcon />
            Sign out
          </button>
        </div>
      )}

      {editingPhoto && <AvatarDialog onClose={() => setEditingPhoto(false)} />}
    </div>
  )
}
