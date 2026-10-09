import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'

// The slice of Google Identity Services (loaded from SCRIPT_SRC) that we use.
interface GoogleIdentity {
  initialize(config: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }): void
  renderButton(
    parent: HTMLElement,
    options: { theme: 'outline' | 'filled_black'; size: 'large'; text: 'continue_with'; shape: 'pill'; width: number },
  ): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } }
  }
}

let scriptPromise: Promise<GoogleIdentity> | null = null

function loadGoogleIdentity(): Promise<GoogleIdentity> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () =>
      window.google ? resolve(window.google.accounts.id) : reject(new Error('Google sign-in failed to load'))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('Google sign-in failed to load'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

// Google gets the SHA-256 of the nonce and puts it in the ID token; Supabase is given the raw nonce and
// checks the two match, so a token captured elsewhere can't be replayed.
async function createNonce() {
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(nonce))
  const hashedNonce = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return { nonce, hashedNonce }
}

export const googleSignInEnabled = Boolean(CLIENT_ID)

// Google's own button, so its sign-in popup opens from this site and names our domain rather than
// redirecting through the Supabase project URL. The ID token it returns is exchanged for a Supabase session.
export function GoogleSignInButton({
  onSignIn,
  onError,
}: {
  onSignIn: () => void
  onError: (message: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    async function setUp() {
      const [identity, { nonce, hashedNonce }] = await Promise.all([loadGoogleIdentity(), createNonce()])
      const container = containerRef.current
      if (cancelled || !container) return

      identity.initialize({
        client_id: CLIENT_ID!,
        nonce: hashedNonce,
        callback: async ({ credential }) => {
          const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: credential, nonce })
          if (error) onError(error.message)
          else onSignIn()
        },
      })
      identity.renderButton(container, {
        theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'filled_black' : 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        // Google caps the width at 400px.
        width: Math.min(container.clientWidth, 400),
      })
    }

    setUp().catch((error: Error) => onError(error.message))
    return () => {
      cancelled = true
    }
  }, [onSignIn, onError])

  return <div ref={containerRef} className="auth-google" />
}
