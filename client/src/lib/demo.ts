import type { Session } from '@supabase/supabase-js'
import { api } from './api'
import { supabase } from './supabaseClient'

// The read-only demo (server/src/lib/demo.ts): a shared account anyone can look around in. Demo
// accounts are flagged in app_metadata, which Supabase puts in the session; the server refuses
// their writes, and api.ts fires DEMO_READ_ONLY_EVENT when it does so the shell can say why.

export function isDemoSession(session: Session | null): boolean {
  return session?.user.app_metadata?.demo === true
}

// Signs into the demo with a one-time token from the server. Two visitors starting at the same
// moment can invalidate each other's token (each one replaces the last), so a failure gets one
// fresh try.
export async function startDemo(): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    const { tokenHash } = await api.post<{ tokenHash: string }>('/api/demo/session')
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (!error) return
    if (attempt > 0) throw error
  }
}
