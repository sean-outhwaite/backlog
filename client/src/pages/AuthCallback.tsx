import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingState } from '../components/Spinner'
import { PENDING_INVITE_KEY } from '../lib/friends'

export function AuthCallback() {
  const { loading, session, profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return

    if (!session) {
      navigate('/sign-in', { replace: true })
      return
    }

    // Back to the invite that sent you to sign in, which asks before adding the friend.
    const pendingInviteToken = localStorage.getItem(PENDING_INVITE_KEY)
    if (pendingInviteToken) {
      localStorage.removeItem(PENDING_INVITE_KEY)
      navigate(`/invite/${encodeURIComponent(pendingInviteToken)}`, { replace: true })
      return
    }

    navigate(profile?.username ? '/' : '/onboarding', { replace: true })
  }, [loading, session, profile, navigate])

  return <LoadingState label="Signing you in…" />
}
