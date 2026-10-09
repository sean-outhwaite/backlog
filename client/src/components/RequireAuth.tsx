import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { AuthShell } from './AuthShell'
import { LoadingState, Spinner } from './Spinner'

export function RequireAuth() {
  const { loading, session, profile, profileUnavailable } = useAuth()

  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/sign-in" replace />
  if (profileUnavailable) return <ProfileUnavailable />
  if (!profile?.username) return <Navigate to="/onboarding" replace />

  return <Outlet />
}

// In place of the app when we're signed in but couldn't load who you are, so a dropped
// connection doesn't look like a new account that still needs a username.
export function ProfileUnavailable() {
  const { retryProfile } = useAuth()
  const [retrying, setRetrying] = useState(false)

  async function retry() {
    setRetrying(true)
    await retryProfile()
    setRetrying(false)
  }

  return (
    <AuthShell>
      <h1>Couldn't reach Backlog</h1>
      <p>Check your connection and try again.</p>
      <button className="btn-primary" onClick={() => void retry()} disabled={retrying} aria-busy={retrying}>
        {retrying && <Spinner />}
        {retrying ? 'Trying…' : 'Try again'}
      </button>
    </AuthShell>
  )
}
