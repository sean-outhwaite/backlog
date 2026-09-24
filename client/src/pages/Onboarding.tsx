import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import type { Profile } from '../types'

export function Onboarding() {
  const { loading, session, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && !session) return <Navigate to="/sign-in" replace />
  if (profile?.username) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await api.patch<Profile>('/api/profile/me', { username })
      await refreshProfile()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell>
      <h1>Pick a username</h1>
      <p>Friends will see this when you recommend something to them.</p>
      <form onSubmit={(event) => void handleSubmit(event)}>
        <input
          required
          minLength={3}
          maxLength={24}
          pattern="[a-zA-Z0-9_]+"
          placeholder="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Continue'}
        </button>
      </form>
      {error && <p className="error-text">{error}</p>}
    </AuthShell>
  )
}
