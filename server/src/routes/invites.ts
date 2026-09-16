import { randomBytes } from 'node:crypto'
import { Router } from 'express'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { prisma } from '../lib/prisma.js'
import { createFriendshipIfMissing } from '../lib/friendship.js'

export const invitesRouter = Router()

invitesRouter.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const invite = await prisma.inviteLink.upsert({
      where: { ownerId: userId },
      create: { ownerId: userId, token: randomBytes(9).toString('base64url') },
      update: {},
    })
    res.json(invite)
  }),
)

invitesRouter.post(
  '/:token/redeem',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const invite = await prisma.inviteLink.findUnique({ where: { token: req.params.token } })
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' })
      return
    }
    if (invite.ownerId === userId) {
      res.status(400).json({ error: "You can't redeem your own invite link" })
      return
    }

    await createFriendshipIfMissing(invite.ownerId, userId)
    res.status(201).json({ friendId: invite.ownerId })
  }),
)
