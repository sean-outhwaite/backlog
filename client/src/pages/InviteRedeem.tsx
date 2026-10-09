import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AuthShell } from '../components/AuthShell'
import { LoadingState, Spinner } from '../components/Spinner'
import { ApiError, api } from '../lib/api'
import { PENDING_INVITE_KEY, invalidateFriends } from '../lib/friends'
import type { InvitePreview } from '../types'

// Opening someone's invite link asks before making you friends, saying whose link it is.
export function InviteRedeem() {
  const { token } = useParams<{ token: string }>()
  const { loading, session } = useAuth()
  const navigate = useNavigate()
  const [preview, setPreview] = useState<InvitePreview | null>(null)
  const [loadError, setLoadError] = useState<'not-found' | 'failed' | null>(null)
  const [accepting, setAccepting] = useState(false)
  const [acceptFailed, setAcceptFailed] = useState(false)

  useEffect(() => {
    if (loading || !token) return

    if (!session) {
      // Signing in comes back here (via AuthCallback) to ask.
      localStorage.setItem(PENDING_INVITE_KEY, token)
      navigate('/sign-in', { replace: true })
      return
    }

    let cancelled = false
    api
      .get<InvitePreview>(`/api/invites/${token}`)
      .then((found) => !cancelled && setPreview(found))
      .catch((error) => !cancelled && setLoadError(error instanceof ApiError && error.status === 404 ? 'not-found' : 'failed'))
    return () => {
      cancelled = true
    }
  }, [loading, session, token, navigate])

  async function accept() {
    setAccepting(true)
    setAcceptFailed(false)
    try {
      await api.post(`/api/invites/${token}/redeem`)
      invalidateFriends()
      navigate('/friends', { replace: true })
    } catch {
      setAcceptFailed(true)
      setAccepting(false)
    }
  }

  if (loadError === 'not-found') {
    return (
      <AuthShell>
        <h1>This link doesn't work</h1>
        <p>It may have been reset. Ask your friend for their current invite link.</p>
        <Link to="/" className="button-link btn-primary">
          Go to Backlog
        </Link>
      </AuthShell>
    )
  }

  if (loadError === 'failed') {
    return (
      <AuthShell>
        <h1>Couldn't load this invite</h1>
        <p>Check your connection and open the link again.</p>
      </AuthShell>
    )
  }

  if (!preview) return <LoadingState />

  const name = preview.owner.username ?? 'Someone'

  if (preview.isOwn) {
    return (
      <AuthShell>
        <h1>This is your own invite link</h1>
        <p>Send it to a friend, and they can add you from here.</p>
        <Link to="/friends" className="button-link btn-primary">
          Go to Friends
        </Link>
      </AuthShell>
    )
  }

  if (preview.alreadyFriends) {
    return (
      <AuthShell>
        <h1>You're already friends with {name}</h1>
        <Link to={`/friends/${preview.owner.id}`} className="button-link btn-primary">
          See their backlog
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <h1>Add {name} as a friend?</h1>
      <p>You'll see each other's lists and can send each other recommendations.</p>
      <div className="invite-confirm-actions">
        <Link to="/" className="button-link btn-quiet">
          Not now
        </Link>
        <button className="btn-primary" onClick={() => void accept()} disabled={accepting} aria-busy={accepting}>
          {accepting && <Spinner />}
          Add friend
        </button>
      </div>
      {acceptFailed && <p className="error-text">Couldn't add {name}. Try again?</p>}
    </AuthShell>
  )
}
