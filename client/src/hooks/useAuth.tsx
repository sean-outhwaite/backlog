import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { api } from '../lib/api'
import type { Profile } from '../types'

interface AuthContextValue {
  loading: boolean
  session: Session | null
  profile: Profile | null
  // Loading the profile failed and there's none to fall back on. Not the same as having no
  // username yet: a dropped connection mustn't send someone to onboarding.
  profileUnavailable: boolean
  refreshProfile: () => Promise<void>
  retryProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileUnavailable, setProfileUnavailable] = useState(false)
  // Mirrors profile for the auth listener, which is set up once and would otherwise see a stale one.
  const profileRef = useRef<Profile | null>(null)

  function storeProfile(next: Profile | null) {
    profileRef.current = next
    setProfile(next)
  }

  async function loadProfile() {
    const me = await api.get<Profile>('/api/profile/me')
    storeProfile(me)
    setProfileUnavailable(false)
  }

  // A failure keeps whatever profile we already had (this runs again on every token refresh and
  // tab refocus), and only counts as unavailable when there's nothing to keep.
  async function tryLoadProfile() {
    try {
      await loadProfile()
    } catch {
      if (!profileRef.current) setProfileUnavailable(true)
    }
  }

  useEffect(() => {
    async function init() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession()
      setSession(initialSession)
      if (initialSession) await tryLoadProfile()
      setLoading(false)
    }
    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession) {
        // A different account signing in mustn't inherit the last one's profile.
        if (profileRef.current?.id !== nextSession.user.id) storeProfile(null)
        void tryLoadProfile()
      } else {
        storeProfile(null)
        setProfileUnavailable(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const value: AuthContextValue = {
    loading,
    session,
    profile,
    profileUnavailable,
    refreshProfile: loadProfile,
    retryProfile: tryLoadProfile,
    signOut: async () => {
      await supabase.auth.signOut()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
