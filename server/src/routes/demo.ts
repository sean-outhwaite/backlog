import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { DemoUnavailableError, demoSignInToken } from '../lib/demo.js'

export const demoRouter = Router()

// Signs a visitor into the read-only demo: returns a one-time token for supabase.auth.verifyOtp.
// Outside requireAuth, since the visitor has no account.
demoRouter.post(
  '/session',
  asyncHandler(async (_req, res) => {
    try {
      res.json({ tokenHash: await demoSignInToken() })
    } catch (error) {
      if (!(error instanceof DemoUnavailableError)) throw error
      console.error(error.message)
      res.status(503).json({ error: "The demo isn't available right now." })
    }
  }),
)
