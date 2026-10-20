import { Router } from 'express'
import { asyncHandler } from '../lib/asyncHandler.js'
import { readIndexHtml, withLinkPreview } from '../lib/linkPreview.js'
import { prisma } from '../lib/prisma.js'

// The page an invite link opens (not /api: vercel.json sends /invite/* here instead of the static
// index.html). It's the same client page, with link-preview tags naming who the invite is from.
export const invitePageRouter = Router()

invitePageRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const html = await readIndexHtml()
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

    res.set('Cache-Control', 'public, max-age=0, must-revalidate')
    if (!owner) {
      res.type('html').send(html)
      return
    }
    res.type('html').send(
      withLinkPreview(html, {
        title: owner.username ? `${owner.username} wants to be friends on Backlog` : "You've been invited to Backlog",
        description: "Join to see what they're watching, reading, and playing, and swap recommendations.",
        image: owner.avatarUrl ?? undefined,
        card: owner.avatarUrl ? 'summary' : 'summary_large_image',
      }),
    )
  }),
)
