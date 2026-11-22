import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { DEMO_READ_ONLY_EVENT } from '../lib/api'
import { Toast } from './Toast'

const TOAST_MS = 4000

// Along the top of the app while signed into the read-only demo: says what this is, offers a way
// out to sign up, and explains (once per refused change, not per request) why a change didn't stick.
export function DemoBanner() {
  const { isDemo, signOut } = useAuth()
  const navigate = useNavigate()
  const [toastId, setToastId] = useState<number | null>(null)

  useEffect(() => {
    const show = () => setToastId(Date.now())
    window.addEventListener(DEMO_READ_ONLY_EVENT, show)
    return () => window.removeEventListener(DEMO_READ_ONLY_EVENT, show)
  }, [])

  useEffect(() => {
    if (toastId === null) return
    const timer = setTimeout(() => setToastId(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toastId])

  if (!isDemo) return null

  async function leave() {
    await signOut()
    navigate('/sign-in')
  }

  return (
    <>
      <div className="demo-banner" role="note">
        <span>
          <strong>You're looking around a demo.</strong> It's read-only, so changes won't save.
        </span>
        <button className="btn-primary" onClick={() => void leave()}>
          Sign up
        </button>
      </div>
      {toastId !== null && (
        <Toast key={toastId} message="This is a read-only demo. Sign up to make your own list." duration={TOAST_MS} />
      )}
    </>
  )
}
