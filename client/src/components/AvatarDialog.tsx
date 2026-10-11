import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { centreCrop, cropAvatar, pickImage, releaseImage, type AvatarCrop, type PickedImage } from '../lib/avatarImage'
import type { Profile } from '../types'
import { Avatar } from './Avatar'
import { AvatarCropper } from './AvatarCropper'
import { CameraIcon } from './icons'
import { Spinner } from './Spinner'

// Upload or remove your profile photo. A picked photo is positioned under the circle first and
// only uploaded on Save; removing saves straight away. Done (or Not now) just closes.
export function AvatarDialog({ onClose }: { onClose: () => void }) {
  const { profile, refreshProfile } = useAuth()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [status, setStatus] = useState<'idle' | 'working' | 'error'>('idle')
  // The photo being positioned, if any, and the square of it currently under the circle.
  const [picked, setPicked] = useState<{ image: PickedImage; crop: AvatarCrop } | null>(null)
  // Mirrors picked so the decoded photo can be freed when the dialog unmounts.
  const pickedRef = useRef<PickedImage | null>(null)

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(
    () => () => {
      if (pickedRef.current) releaseImage(pickedRef.current)
    },
    [],
  )

  function replacePicked(image: PickedImage | null) {
    if (pickedRef.current) releaseImage(pickedRef.current)
    pickedRef.current = image
    setPicked(image && { image, crop: centreCrop(image.bitmap) })
  }

  const close = () => dialogRef.current?.close()

  async function save(change: () => Promise<unknown>) {
    setStatus('working')
    try {
      await change()
      await refreshProfile()
      setStatus('idle')
      return true
    } catch {
      setStatus('error')
      return false
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Cleared so picking the same file again still fires a change.
    event.target.value = ''
    if (!file) return
    try {
      replacePicked(await pickImage(file))
      setStatus('idle')
    } catch {
      // A format this browser can't decode, such as HEIC outside Safari.
      setStatus('error')
    }
  }

  async function savePicked() {
    if (!picked) return
    const saved = await save(async () =>
      api.putBlob<Profile>('/api/profile/avatar', await cropAvatar(picked.image.bitmap, picked.crop)),
    )
    if (saved) replacePicked(null)
  }

  const working = status === 'working'

  return createPortal(
    <dialog
      ref={dialogRef}
      className="modal-dialog"
      aria-labelledby={headingId}
      onClose={(event) => {
        event.stopPropagation()
        onClose()
      }}
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className="confirm avatar-editor">
        <h2 id={headingId}>Profile photo</h2>
        {picked ? (
          <>
            <AvatarCropper
              key={picked.image.url}
              image={picked.image}
              onChange={(crop) => setPicked((current) => current && { ...current, crop })}
            />
            <p className="avatar-editor-hint">Drag to position your photo, and zoom in if you like.</p>
          </>
        ) : (
          <>
            <button
              type="button"
              className="avatar-editor-preview"
              onClick={() => inputRef.current?.click()}
              disabled={working}
              aria-label={profile?.avatarUrl ? 'Choose another photo' : 'Choose a photo'}
            >
              <Avatar profile={profile} size="xl" />
              {working ? (
                <Spinner />
              ) : (
                <span className="avatar-editor-camera">
                  <CameraIcon />
                </span>
              )}
            </button>
            <p className="avatar-editor-hint">Friends see this next to your name.</p>
            {profile?.avatarUrl && (
              <button
                type="button"
                className="btn-quiet avatar-editor-remove"
                onClick={() => void save(() => api.delete<Profile>('/api/profile/avatar'))}
                disabled={working}
              >
                Remove photo
              </button>
            )}
          </>
        )}
        {status === 'error' && <p className="error-text">That didn't work. Try again, or pick a different photo?</p>}
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={(event) => void handleFile(event)} />
        <footer className="confirm-footer">
          {picked ? (
            <>
              <button
                type="button"
                className="btn-quiet"
                onClick={() => {
                  replacePicked(null)
                  setStatus('idle')
                }}
                disabled={working}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void savePicked()} disabled={working}>
                {working && <Spinner />}
                Save
              </button>
            </>
          ) : (
            <>
              {/* With a photo set, finishing is the main action; without one, choosing is. */}
              {profile?.avatarUrl ? (
                <>
                  <button type="button" onClick={() => inputRef.current?.click()} disabled={working}>
                    Change photo
                  </button>
                  <button type="button" className="btn-primary" onClick={close} autoFocus>
                    Done
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={close}>
                    Not now
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => inputRef.current?.click()}
                    disabled={working}
                    autoFocus
                  >
                    Choose photo
                  </button>
                </>
              )}
            </>
          )}
        </footer>
      </div>
    </dialog>,
    document.body,
  )
}
