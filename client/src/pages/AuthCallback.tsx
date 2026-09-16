import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'

const PENDING_INVITE_KEY = 'pendingInviteToken'

export function AuthCallback() {
  const { loading, session, profile } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return

    async function finish() {
      if (!session) {
        navigate('/sign-in', { replace: true })
        return
      }

      const pendingInviteToken = localStorage.getItem(PENDING_INVITE_KEY)
      if (pendingInviteToken) {
        localStorage.removeItem(PENDING_INVITE_KEY)
        // Own/expired invite links fail here; that's fine, just continue signed in.
        await api.post(`/api/invites/${pendingInviteToken}/redeem`).catch(() => {})
      }

      navigate(profile?.username ? '/' : '/onboarding', { replace: true })
    }

    void finish()
  }, [loading, session, profile, navigate])

  return <p className="page-status">Signing you in…</p>
}
