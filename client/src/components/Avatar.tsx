import { useState } from 'react'
import type { Profile } from '../types'

// Someone's photo, or the first letter of their username when they haven't set one (or it fails to load).
export function Avatar({
  profile,
  size,
}: {
  profile: Pick<Profile, 'username' | 'avatarUrl'> | null | undefined
  size?: 'sm' | 'lg' | 'xl'
}) {
  // Remembers which URL failed, so a newly uploaded photo gets a fresh try.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const src = profile?.avatarUrl && profile.avatarUrl !== failedUrl ? profile.avatarUrl : null

  return (
    <span className={size ? `avatar avatar--${size}` : 'avatar'} aria-hidden="true">
      {src ? (
        <img src={src} alt="" loading="lazy" onError={() => setFailedUrl(src)} />
      ) : (
        profile?.username?.[0]?.toUpperCase()
      )}
    </span>
  )
}
