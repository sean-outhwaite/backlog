import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { env } from '../lib/env.js'
import { checkReleases } from '../lib/releases.js'

// Scheduled jobs, called by Vercel Cron (see vercel.json) rather than by users, so there's no
// requireAuth: Vercel sends `Authorization: Bearer <CRON_SECRET>` instead.
export const cronRouter = Router()

cronRouter.get(
  '/releases',
  asyncHandler(async (req, res) => {
    if (!env.cronSecret) {
      res.status(503).json({ error: 'CRON_SECRET is not set' })
      return
    }
    if (req.header('authorization') !== `Bearer ${env.cronSecret}`) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const summary = await checkReleases()
    console.log('Release check:', JSON.stringify(summary))
    res.json(summary)
  }),
)
