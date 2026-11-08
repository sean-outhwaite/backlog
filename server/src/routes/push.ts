import { Router } from 'express'
import { z } from 'zod'
import type { AuthedRequest } from '../middleware/auth.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { env } from '../lib/env.js'
import { isUniqueConstraintError, prisma } from '../lib/prisma.js'
import { isPushServiceUrl } from '../lib/push.js'

export const pushRouter = Router()

// The VAPID public key the browser subscribes with. Served from here rather than built into the
// client so the two can't drift apart.
pushRouter.get('/key', (_req, res) => {
  if (!env.vapid) {
    res.status(503).json({ error: 'Push notifications are not configured' })
    return
  }
  res.json({ publicKey: env.vapid.publicKey })
})

const endpointSchema = z.string().max(2048).refine(isPushServiceUrl, 'Not a known push service URL')

// The shape of a browser PushSubscription's toJSON().
const subscriptionSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
})

// Saves this device's subscription. The client sends it on every app load while push is on, so
// this is usually a duplicate: create, and on a duplicate endpoint update it in place, which also
// moves a device to whoever is signed in on it now.
pushRouter.post(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = subscriptionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    const { endpoint, keys } = parsed.data
    const data = { userId, p256dh: keys.p256dh, auth: keys.auth }
    try {
      await prisma.pushSubscription.create({ data: { endpoint, ...data } })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      await prisma.pushSubscription.updateMany({ where: { endpoint }, data })
    }
    res.status(204).end()
  }),
)

// Turns push off for this device (or on sign-out). Only your own subscription.
pushRouter.delete(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { userId } = req as unknown as AuthedRequest
    const parsed = z.object({ endpoint: z.string().max(2048) }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: z.flattenError(parsed.error) })
      return
    }
    await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId } })
    res.status(204).end()
  }),
)
