import { Router } from 'express'
import type { Request, Response } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { isInviteTokenShaped } from '../lib/inviteTokens.js'
import { readIndexHtml, withLinkPreview } from '../lib/linkPreview.js'
import { prisma } from '../lib/prisma.js'

// The page an invite link opens (not /api: vercel.json sends /invite/* here instead of the static
// index.html). It's the same client page, with link-preview tags naming who the invite is from.
export const invitePageRouter = Router()

// Shown only if the client page can't be found at all, instead of the API's JSON error.
const UNAVAILABLE_PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Backlog</title></head>
  <body style="font-family: system-ui, sans-serif; text-align: center; padding: 64px 16px">
    <p>This invite couldn't be opened just now. <a href="">Try again</a> in a moment.</p>
  </body>
</html>`

// Vercel only routes requests for this project's own domains here, so the Host header is trusted
// there. Locally there's nothing serving the page statically to fall back to.
function staticOrigin(req: Request) {
  return process.env.VERCEL ? `https://${req.get('host')}` : undefined
}

async function sendPage(req: Request, res: Response, preview?: (html: string) => string) {
  let html: string
  try {
    html = await readIndexHtml(staticOrigin(req))
  } catch (error) {
    console.error(error)
    res.status(503).type('html').send(UNAVAILABLE_PAGE)
    return
  }
  res.set('Cache-Control', 'public, max-age=0, must-revalidate')
  res.type('html').send(preview ? preview(html) : html)
}

invitePageRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    if (!isInviteTokenShaped(req.params.token)) {
      await sendPage(req, res)
      return
    }
    // One query rather than findUnique + include, which would be several round trips.
    const [owner] = await prisma.$queryRaw<{ username: string | null; avatarUrl: string | null }[]>`
      SELECT p."username", p."avatarUrl"
      FROM "InviteLink" i
      JOIN "Profile" p ON p."id" = i."ownerId"
      WHERE i."token" = ${req.params.token}
    `.catch((error) => {
      // A preview isn't worth failing the page over; the client checks the token itself.
      console.error(error)
      return []
    })

    await sendPage(
      req,
      res,
      owner &&
        ((html) =>
          withLinkPreview(html, {
            title: owner.username ? `${owner.username} wants to be friends on Backlog` : "You've been invited to Backlog",
            description: "Join to see what they're watching, reading, and playing, and swap recommendations.",
            image: owner.avatarUrl ?? undefined,
            card: owner.avatarUrl ? 'summary' : 'summary_large_image',
          })),
    )
  }),
)

// Anything else under /invite (a bare /invite/, a link mangled in chat): the plain page, so the
// client shows its own not-found screen rather than Express's.
invitePageRouter.get(
  '*',
  asyncHandler(async (req, res) => {
    await sendPage(req, res)
  }),
)
