import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { env } from './lib/env.js'
import { requireAuth } from './middleware/auth.js'
import { friendsRouter } from './routes/friends.js'
import { invitesRouter } from './routes/invites.js'
import { listsRouter } from './routes/lists.js'
import { mediaRouter } from './routes/media.js'
import { notificationsRouter } from './routes/notifications.js'
import { profileRouter } from './routes/profile.js'
import { recommendationsRouter } from './routes/recommendations.js'

export const app = express()

app.use(cors({ origin: env.clientOrigin }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api/media', requireAuth, mediaRouter)
app.use('/api/lists', requireAuth, listsRouter)
app.use('/api/profile', requireAuth, profileRouter)
app.use('/api/invites', requireAuth, invitesRouter)
app.use('/api/friends', requireAuth, friendsRouter)
app.use('/api/recommendations', requireAuth, recommendationsRouter)
app.use('/api/notifications', requireAuth, notificationsRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Body parsers flag client errors (too large, malformed) as `expose`; pass those through as-is.
  const clientError = err as { expose?: boolean; status?: number; message?: string }
  if (clientError.expose && clientError.status && clientError.status < 500) {
    res.status(clientError.status).json({ error: clientError.message })
    return
  }
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})
