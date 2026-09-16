import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function RequireAuth() {
  const { loading, session, profile } = useAuth()

  if (loading) return <p className="page-status">Loading…</p>
  if (!session) return <Navigate to="/sign-in" replace />
  if (!profile?.username) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
