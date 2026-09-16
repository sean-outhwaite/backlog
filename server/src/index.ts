import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import { env } from './lib/env.js'
import { requireAuth } from './middleware/auth.js'
import { friendsRouter } from './routes/friends.js'
import { invitesRouter } from './routes/invites.js'
import { listsRouter } from './routes/lists.js'
import { mediaRouter } from './routes/media.js'
import { profileRouter } from './routes/profile.js'
import { recommendationsRouter } from './routes/recommendations.js'

const app = express()

app.use(cors({ origin: env.clientOrigin }))
app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.use('/api/media', requireAuth, mediaRouter)
app.use('/api/lists', requireAuth, listsRouter)
app.use('/api/profile', requireAuth, profileRouter)
app.use('/api/invites', requireAuth, invitesRouter)
app.use('/api/friends', requireAuth, friendsRouter)
app.use('/api/recommendations', requireAuth, recommendationsRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: 'Internal server error' })
})

app.listen(env.port, () => {
  console.log(`Backlog API listening on http://localhost:${env.port}`)
})
