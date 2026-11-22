import { timingSafeEqual } from 'node:crypto'
import { env } from './env.js'

// The read-only demo: one shared account (and a few sample friends) that anyone can sign into from
// the sign-in page, so a visitor can look around without signing up. Every demo account carries
// `app_metadata.demo = true`, which users can't change and which Supabase copies into each access
// token, so requireAuth can tell a demo request from the token alone. The accounts and their lists
// are made by `server/scripts/seedDemo.ts`. The flag is never cleared, not even while seeding: a
// session refreshed while it was off would get a writable token that outlives the seed.

export const DEMO_EMAIL = 'demo@backlog.outh.nz'

export const DEMO_READ_ONLY_MESSAGE = 'This is a read-only demo. Sign up to make your own list.'

export function isDemoToken(payload: Record<string, unknown>): boolean {
  const metadata = payload.app_metadata
  return typeof metadata === 'object' && metadata !== null && (metadata as { demo?: unknown }).demo === true
}

export type DemoVerdict = 'allow' | 'no-op' | 'refuse'

// What a demo account may do. Reads are fine; writes are refused, so nothing a visitor does can
// show up for the next one. A few writes the app makes on its own (marking notifications read when
// they're opened, dropping this device's push subscription on sign-out) are answered as if they'd
// worked, so the demo doesn't greet people with errors for things they didn't ask for.
// The demo's own invite link is refused too, even though fetching it is a GET: the link is made
// on first fetch, and anyone redeeming it would become a friend of the demo, putting their lists
// in front of every visitor. (The invites route refuses it as well, since that's the check that
// matters: this one only saves a round trip.)
// Express matches routes case-insensitively and ignores a trailing slash, so `path` (as requested)
// is normalised the same way before comparing, or /api/invites/MINE would slip past.
export function demoVerdict(method: string, requestedPath: string): DemoVerdict {
  const path = requestedPath.toLowerCase().replace(/\/+$/, '')
  if (method === 'GET' || method === 'HEAD') return path === '/api/invites/mine' ? 'refuse' : 'allow'
  if (method === 'POST' && path === '/api/notifications/read') return 'no-op'
  if (method === 'DELETE' && path === '/api/push/subscriptions') return 'no-op'
  return 'refuse'
}

// The seed script (scripts/seedDemo.ts) writes through the API as the demo accounts, which the guard
// would refuse. It sends DEMO_SEED_SECRET in this header instead of clearing the demo flag. Only
// honoured off Vercel, so production never takes demo writes even if the secret were set there.
export const DEMO_SEED_HEADER = 'x-demo-seed'

export function isDemoSeedRequest(header: string | undefined): boolean {
  const secret = env.demoSeedSecret
  if (!secret || process.env.VERCEL || !header) return false
  const given = Buffer.from(header)
  const expected = Buffer.from(secret)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

function adminHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
}

export class DemoUnavailableError extends Error {}

// A one-time sign-in token for the demo account, which the client exchanges for a session with
// supabase.auth.verifyOtp. Made with Supabase's admin generate_link, which sends no email. Refuses
// unless the account is flagged as a demo, so a missing seed can't hand out a writable account
// (generate_link would otherwise create a plain user for the address).
export async function demoSignInToken(): Promise<string> {
  const key = env.supabaseServiceRoleKey
  if (!key) throw new DemoUnavailableError('SUPABASE_SERVICE_ROLE_KEY is not set')

  const response = await fetch(`${env.supabaseUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: adminHeaders(key),
    body: JSON.stringify({ type: 'magiclink', email: DEMO_EMAIL }),
  })
  if (!response.ok) throw new Error(`generate_link failed: ${response.status} ${await response.text()}`)
  const body = (await response.json()) as {
    hashed_token?: string
    app_metadata?: unknown
    properties?: { hashed_token?: string }
    user?: { app_metadata?: unknown }
  }
  const appMetadata = body.user?.app_metadata ?? body.app_metadata
  const hashedToken = body.properties?.hashed_token ?? body.hashed_token
  if (!isDemoToken({ app_metadata: appMetadata })) throw new DemoUnavailableError('The demo account is not set up')
  if (!hashedToken) throw new Error('generate_link returned no token')
  return hashedToken
}
