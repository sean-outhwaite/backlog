import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthShell } from '../components/AuthShell'
import { useAuth } from '../hooks/useAuth'

export function SignIn() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  async function handleGoogle() {
    setError(null)
    // Redirects away to Google; on return, AuthCallback picks up the session like a magic link.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (oauthError) setError(oauthError.message)
  }

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
          <button type="button" className="auth-google" onClick={() => void handleGoogle()}>
            <GoogleIcon />
            Continue with Google
          </button>
          <p className="auth-divider">or</p>
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
    </AuthShell>
  )
}

// Google's multicolour "G", per their sign-in button branding guidelines.
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
