import type { Request } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { asyncHandler } from '../lib/asyncHandler.js'
import { DEMO_READ_ONLY_MESSAGE, DEMO_SEED_HEADER, demoVerdict, isDemoSeedRequest, isDemoToken } from '../lib/demo.js'
import { env } from '../lib/env.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'

// isDemo: a read-only demo account (lib/demo.ts), for routes that refuse demo users themselves.
export type AuthedRequest = Request<Record<string, string>> & { userId: string; isDemo: boolean }

const jwks = createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))

// Users whose Profile row this process has already ensured exists, so the check costs a DB
// round trip once per user per process rather than on every request.
const knownProfileIds = new Set<string>()

async function ensureProfile(userId: string) {
  if (knownProfileIds.has(userId)) return
  try {
    await prisma.profile.create({ data: { id: userId } })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
  }
  knownProfileIds.add(userId)
}

export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.header('authorization')
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
  if (!token) {
    res.status(401).json({ error: 'Missing bearer token' })
    return
  }

  let userId: string
  let isDemo: boolean
  try {
    // Only signed-in users' access tokens: the JWKS alone accepts anything this project signs.
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${env.supabaseUrl}/auth/v1`,
      audience: 'authenticated',
    })
    if (typeof payload.sub !== 'string') throw new Error('Missing sub claim')
    if (payload.is_anonymous === true) throw new Error('Anonymous sessions are not supported')
    userId = payload.sub
    // The demo seed script's own requests are let through (local dev only).
    isDemo = isDemoToken(payload) && !isDemoSeedRequest(req.header(DEMO_SEED_HEADER))
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  // The demo account can look but not touch (see lib/demo.ts). `demo: true` lets the client say so.
  if (isDemo) {
    const verdict = demoVerdict(req.method, `${req.baseUrl}${req.path}`)
    if (verdict === 'refuse') {
      res.status(403).json({ error: DEMO_READ_ONLY_MESSAGE, demo: true })
      return
    }
    if (verdict === 'no-op') {
      res.status(204).end()
      return
    }
  }

  await ensureProfile(userId)

  ;(req as unknown as AuthedRequest).userId = userId
  ;(req as unknown as AuthedRequest).isDemo = isDemo
  next()
})
