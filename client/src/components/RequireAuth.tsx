import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingState } from './Spinner'

export function RequireAuth() {
  const { loading, session, profile } = useAuth()

  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/sign-in" replace />
  if (!profile?.username) return <Navigate to="/onboarding" replace />

  return <Outlet />
}
