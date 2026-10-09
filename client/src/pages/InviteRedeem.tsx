import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingState } from '../components/Spinner'
import { api } from '../lib/api'
import { invalidateFriends } from '../lib/friends'

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
      .then(() => {
        invalidateFriends()
        navigate('/friends', { replace: true })
      })
  }, [loading, session, token, navigate])

  return <LoadingState label="Connecting you with your friend…" />
}
