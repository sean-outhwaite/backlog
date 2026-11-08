import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { AuthShell } from '../components/AuthShell'
import { GoogleSignInButton, googleSignInEnabled } from '../components/GoogleSignInButton'
import { useAuth } from '../hooks/useAuth'

// Supabase won't send another email to the same address sooner than this.
const RESEND_COOLDOWN_SECONDS = 60

export function SignIn() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'verifying' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [resendIn, setResendIn] = useState(0)

  // Google sign-in happens without leaving the page, so send the new session through AuthCallback
  // (invite redemption, onboarding) the same way a magic link arrives. A typed email code does too.
  const goToCallback = useCallback(() => window.location.assign('/auth/callback'), [])
  const handleGoogleError = useCallback((message: string) => setError(message), [])

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setTimeout(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearTimeout(timer)
  }, [resendIn])

  if (!loading && session) return <Navigate to="/" replace />

  // A resend stays on the code step whatever happens; a first send goes back to the form on failure.
  async function sendEmail(resend = false) {
    if (resend) setResendIn(RESEND_COOLDOWN_SECONDS)
    else setStatus('sending')
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (signInError) {
      setError(signInError.message)
      if (!resend) setStatus('error')
    } else {
      setStatus('sent')
      setResendIn(RESEND_COOLDOWN_SECONDS)
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void sendEmail()
  }

  // The email carries a code as well as the link, because on iOS the link opens in Safari, whose
  // storage is separate from the installed app's: the code is how you sign in inside the app.
  async function handleVerify(event: FormEvent) {
    event.preventDefault()
    setStatus('verifying')
    setError(null)

    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })

    if (verifyError) {
      setError(verifyError.message)
      setStatus('sent')
    } else {
      goToCallback()
    }
  }

  function startOver() {
    setStatus('idle')
    setCode('')
    setError(null)
  }

  const awaitingCode = status === 'sent' || status === 'verifying'

  return (
    <AuthShell>
      <h1 className="wordmark">Backlog</h1>
      <p>
        Keep track of everything you've been meaning to watch, read, and play. Share recommendations for your mates to
        ignore.
      </p>

      {awaitingCode ? (
        <>
          <p className="auth-sent">
            We've emailed a sign-in link and code to <strong>{email}</strong>. Open the link, or enter the code here.
          </p>
          <form className="auth-code-form" onSubmit={(event) => void handleVerify(event)}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label="Sign-in code"
              placeholder="Code"
              required
              pattern="\d{6,10}"
              maxLength={10}
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
            <button type="submit" className="btn-primary" disabled={status === 'verifying'}>
              {status === 'verifying' ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
          <div className="auth-code-actions">
            <button type="button" className="btn-quiet" disabled={resendIn > 0} onClick={() => void sendEmail(true)}>
              {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend email'}
            </button>
            <button type="button" className="btn-quiet" onClick={startOver}>
              Use a different email
            </button>
          </div>
        </>
      ) : (
        <>
          {googleSignInEnabled && (
            <>
              <GoogleSignInButton onSignIn={goToCallback} onError={handleGoogleError} />
              <p className="auth-divider">or</p>
            </>
          )}
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send sign-in email'}
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
