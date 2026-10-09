import { api } from './api'
import type { Profile } from '../types'

// Every card's recommend button wants the friends list; share one request between them. It's
// only reused briefly, so a friend who joins through your invite link shows up on the next page.
const MAX_AGE_MS = 30_000

let cached: { request: Promise<Profile[]>; fetchedAt: number } | null = null

export function getFriends(): Promise<Profile[]> {
  if (!cached || Date.now() - cached.fetchedAt > MAX_AGE_MS) {
    const request = api.get<Profile[]>('/api/friends').catch((error) => {
      // Don't keep a failure; the next caller tries again.
      if (cached?.request === request) cached = null
      throw error
    })
    cached = { request, fetchedAt: Date.now() }
  }
  return cached.request
}

// Call after anything that changes who your friends are, such as redeeming an invite.
export function invalidateFriends() {
  cached = null
}

// An invite link opened while signed out, kept across sign-in so AuthCallback can return to it.
export const PENDING_INVITE_KEY = 'pendingInviteToken'
