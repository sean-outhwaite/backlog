import type { Request } from 'express'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { asyncHandler } from '../lib/asyncHandler.js'
import { env } from '../lib/env.js'
import { prisma } from '../lib/prisma.js'

export type AuthedRequest = Request<Record<string, string>> & { userId: string }

const jwks = createRemoteJWKSet(new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`))

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

  await prisma.profile.upsert({
    where: { id: userId },
    create: { id: userId },
    update: {},
  })

  ;(req as unknown as AuthedRequest).userId = userId
  next()
})
