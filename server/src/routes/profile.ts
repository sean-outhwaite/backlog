import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'

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
