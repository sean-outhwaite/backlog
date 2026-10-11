import express, { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { AvatarStorageUnavailableError, deleteAvatar, uploadAvatar } from '../lib/avatars.js'

export const profileRouter = Router()

profileRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const profile = await prisma.profile.findUnique({ where: { id: userId } })
    res.json(profile)
  }),
)

const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(24)
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only'),
})

profileRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = updateProfileSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() })
      return
    }

    const taken = await prisma.profile.findUnique({ where: { username: parsed.data.username } })
    if (taken && taken.id !== userId) {
      res.status(409).json({ error: 'Username already taken' })
      return
    }

    const profile = await prisma.profile.update({
      where: { id: userId },
      data: { username: parsed.data.username },
    })
    res.json(profile)
  }),
)

// The client sends a square image it has already shrunk to 256px (~30KB), so the limit is generous.
// WebP where the browser can encode it, JPEG otherwise (Safari's canvas can't write WebP).
const MAX_AVATAR_BYTES = 512 * 1024
const AVATAR_TYPES = ['image/webp', 'image/jpeg']

// Checks the file's own signature rather than trusting the Content-Type header.
function imageTypeOf(body: Buffer): string | null {
  if (body.length > 12 && body.toString('ascii', 0, 4) === 'RIFF' && body.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg'
  return null
}

profileRouter.put(
  '/avatar',
  express.raw({ type: AVATAR_TYPES, limit: MAX_AVATAR_BYTES }),
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const contentType = Buffer.isBuffer(req.body) ? imageTypeOf(req.body) : null
    if (!contentType) {
      res.status(400).json({ error: 'Expected a WebP or JPEG image' })
      return
    }

    let avatarUrl: string
    try {
      avatarUrl = await uploadAvatar(userId, req.body, contentType)
    } catch (error) {
      if (!(error instanceof AvatarStorageUnavailableError)) throw error
      res.status(503).json({ error: 'Avatar uploads are not set up' })
      return
    }
    const profile = await prisma.profile.update({ where: { id: userId }, data: { avatarUrl } })
    res.json(profile)
  }),
)

profileRouter.delete(
  '/avatar',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    try {
      await deleteAvatar(userId)
    } catch (error) {
      if (!(error instanceof AvatarStorageUnavailableError)) throw error
      res.status(503).json({ error: 'Avatar uploads are not set up' })
      return
    }
    const profile = await prisma.profile.update({ where: { id: userId }, data: { avatarUrl: null } })
    res.json(profile)
  }),
)
