import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthShell } from '../components/AuthShell'
import { Spinner } from '../components/Spinner'
import { useAuth } from '../hooks/useAuth'
import { startDemo } from '../lib/demo'

// /demo: signs straight into the read-only demo, for linking to from elsewhere (a portfolio).
// Someone already signed in just goes to their own list rather than being signed out of it.
export function DemoStart() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  // 'idle' until this page starts the demo itself, so arriving already signed in can be told apart
  // from the session the demo just made.
  const [phase, setPhase] = useState<'idle' | 'starting' | 'failed'>('idle')
  // Once only: StrictMode runs effects twice, and a second token would cancel the first.
  const started = useRef(false)

  useEffect(() => {
    if (loading || session || started.current) return
    started.current = true
    setPhase('starting')
    startDemo()
      .then(() => navigate('/', { replace: true }))
      .catch(() => setPhase('failed'))
  }, [loading, session, navigate])

  if (!loading && session && phase === 'idle') return <Navigate to="/" replace />

  return (
    <AuthShell>
      {phase === 'failed' ? (
        <>
          <h1>The demo isn't available</h1>
          <p>Something went wrong opening it. You can still sign up and try Backlog for yourself.</p>
          <Link to="/sign-in" className="btn-primary">
            Sign up
          </Link>
        </>
      ) : (
        <>
          <h1>Opening the demo…</h1>
          <Spinner />
        </>
      )}
    </AuthShell>
  )
}
