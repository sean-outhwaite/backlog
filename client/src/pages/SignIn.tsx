import { useCallback, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthShell } from '../components/AuthShell'
import { GoogleSignInButton, googleSignInEnabled } from '../components/GoogleSignInButton'
import { useAuth } from '../hooks/useAuth'

export function SignIn() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  // Google sign-in happens without leaving the page, so send the new session through AuthCallback
  // (invite redemption, onboarding) the same way a magic link arrives.
  const handleGoogleSignIn = useCallback(() => window.location.assign('/auth/callback'), [])
  const handleGoogleError = useCallback((message: string) => setError(message), [])

  if (!loading && session) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setStatus('sending')
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (signInError) {
      setError(signInError.message)
      setStatus('error')
    } else {
      setStatus('sent')
    }
  }

  return (
    <AuthShell>
      <h1 className="wordmark">Backlog</h1>
      <p>Track what you want to watch, read, and play — and pass it on to friends.</p>

      {status === 'sent' ? (
        <p className="auth-sent">Check your email for a sign-in link.</p>
      ) : (
        <>
          {googleSignInEnabled && (
            <>
              <GoogleSignInButton onSignIn={handleGoogleSignIn} onError={handleGoogleError} />
              <p className="auth-divider">or</p>
            </>
          )}
          <form onSubmit={(event) => void handleSubmit(event)}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send sign-in link'}
            </button>
          </form>
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <p className="auth-footer">
        <Link to="/privacy">Privacy policy</Link>
      </p>
    </AuthShell>
  )
}
