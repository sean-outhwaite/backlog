import { Prisma, type MediaItem, type MediaType } from '@prisma/client'
import { friendIdsSql } from './friendship.js'
import { prisma } from './prisma.js'

const LIMIT = 12
// A friend who's started or finished a title counts for a bit more than one who only wants it.
const ENGAGED_BONUS = 0.5

export interface FriendsPopularItem {
  mediaItem: MediaItem
  friends: { id: string; username: string | null; avatarUrl: string | null }[]
}

type Row = MediaItem & { friendIds: string[] }

// What's on your friends' lists that isn't on yours, most widely shared first: one point per friend
// with it, a bit more for each who's actually started or finished it, ties broken by whoever added
// it most recently. One query for the ranking (it finds your friends itself), one for their profiles.
export async function friendsPopular(userId: string, type?: MediaType): Promise<FriendsPopularItem[]> {
  const typeFilter = type ? Prisma.sql`AND m."type" = ${type}::"MediaType"` : Prisma.empty
  const rows = await prisma.$queryRaw<Row[]>`
    WITH friends AS (${friendIdsSql(userId)}),
    ranked AS (
      SELECT
        e."mediaItemId",
        array_agg(e."userId" ORDER BY e."addedAt" DESC) AS "friendIds",
        COUNT(*) + ${ENGAGED_BONUS} * COUNT(*) FILTER (WHERE e."status" <> 'want') AS score,
        MAX(e."addedAt") AS latest
      FROM "ListEntry" e
      JOIN friends f ON f.id = e."userId"
      WHERE NOT EXISTS (
        SELECT 1 FROM "ListEntry" mine WHERE mine."userId" = ${userId} AND mine."mediaItemId" = e."mediaItemId"
      )
      GROUP BY e."mediaItemId"
    )
    SELECT m.*, r."friendIds"
    FROM ranked r
    JOIN "MediaItem" m ON m."id" = r."mediaItemId"
    WHERE TRUE ${typeFilter}
    ORDER BY r.score DESC, r.latest DESC
    LIMIT ${LIMIT}
  `
  if (rows.length === 0) return []

  const friendIds = [...new Set(rows.flatMap((row) => row.friendIds))]
  const profiles = await prisma.profile.findMany({
    where: { id: { in: friendIds } },
    select: { id: true, username: true, avatarUrl: true },
  })
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

  return rows.map(({ friendIds: ids, ...mediaItem }) => ({
    mediaItem,
    friends: ids.flatMap((id) => profileById.get(id) ?? []),
  }))
}
