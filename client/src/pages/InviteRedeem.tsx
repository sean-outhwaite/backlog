import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'

const PENDING_INVITE_KEY = 'pendingInviteToken'

export function InviteRedeem() {
  const { token } = useParams<{ token: string }>()
  const { loading, session } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading || !token) return

    if (!session) {
      localStorage.setItem(PENDING_INVITE_KEY, token)
      navigate('/sign-in', { replace: true })
      return
    }

    api
      .post(`/api/invites/${token}/redeem`)
      .catch(() => {})
      .then(() => navigate('/friends', { replace: true }))
  }, [loading, session, token, navigate])

  return <p className="page-status">Connecting you with your friend…</p>
}
