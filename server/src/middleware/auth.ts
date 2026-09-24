import type { Request } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { asyncHandler } from '../lib/asyncHandler.js'
import { env } from '../lib/env.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'

export type AuthedRequest = Request<Record<string, string>> & { userId: string }

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
  try {
    const { payload } = await jwtVerify(token, jwks)
    if (typeof payload.sub !== 'string') throw new Error('Missing sub claim')
    userId = payload.sub
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  await ensureProfile(userId)

  ;(req as unknown as AuthedRequest).userId = userId
  next()
})
