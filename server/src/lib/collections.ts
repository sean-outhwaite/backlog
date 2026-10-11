import { Prisma, type Collection, type MediaItem } from '@prisma/client'
import { friendIdsSql } from './friendship.js'
import { isUniqueConstraintError, prisma } from './prisma.js'
import { sourceByType } from '../providers/index.js'
import type { MediaRef } from './mediaItems.js'

export const PICKS_NAME = 'My picks'
const COVERS_SHOWN = 3

// A list as shown on a list of lists: its newest few covers rather than its items. `contains` is
// only set when asked about a particular title (for the "Add to list" picker).
export type CollectionSummary = Collection & { itemCount: number; covers: string[]; contains?: boolean }

// Whether a list holds the given title, as a SQL boolean over the joined item's MediaItem (m).
// Matched by provider identity when that's all we have, so asking never creates a MediaItem.
function containsSql(ref: MediaRef) {
  if ('mediaItemId' in ref) return Prisma.sql`COALESCE(bool_or(m."id" = ${ref.mediaItemId}), false)`
  return Prisma.sql`COALESCE(bool_or(
    m."source" = ${sourceByType[ref.type]}::"MediaSource" AND m."type" = ${ref.type}::"MediaType"
    AND m."kind" = ${ref.kind}::"MediaKind" AND m."externalId" = ${ref.externalId}
  ), false)`
}

// Someone's lists, picks first then newest, in one query. Friends only see lists with something in them.
export async function collectionSummaries(
  ownerId: string,
  { nonEmptyOnly = false, contains }: { nonEmptyOnly?: boolean; contains?: MediaRef } = {},
): Promise<CollectionSummary[]> {
  return prisma.$queryRaw<CollectionSummary[]>`
    SELECT
      c.*,
      COUNT(i."mediaItemId")::int AS "itemCount",
      COALESCE(
        (array_agg(m."coverImageUrl" ORDER BY i."addedAt" DESC) FILTER (WHERE m."coverImageUrl" IS NOT NULL))[1:${COVERS_SHOWN}],
        '{}'
      ) AS covers
      ${contains ? Prisma.sql`, ${containsSql(contains)} AS contains` : Prisma.empty}
    FROM "Collection" c
    LEFT JOIN "CollectionItem" i ON i."collectionId" = c."id"
    LEFT JOIN "MediaItem" m ON m."id" = i."mediaItemId"
    WHERE c."ownerId" = ${ownerId}
    GROUP BY c."id"
    ${nonEmptyOnly ? Prisma.sql`HAVING COUNT(i."mediaItemId") > 0` : Prisma.empty}
    ORDER BY (c."kind" = 'picks') DESC, c."createdAt" DESC
  `
}

// Your picks list, created the first time it's needed. The partial unique index means a racing
// second create fails rather than making a duplicate.
export async function ensurePicks(ownerId: string): Promise<Collection> {
  const existing = await prisma.collection.findFirst({ where: { ownerId, kind: 'picks' } })
  if (existing) return existing
  try {
    return await prisma.collection.create({ data: { ownerId, kind: 'picks', name: PICKS_NAME } })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    return prisma.collection.findFirstOrThrow({ where: { ownerId, kind: 'picks' } })
  }
}

type Picker = { id: string; username: string | null; avatarUrl: string | null }

export interface FriendsPick {
  mediaItem: MediaItem
  // Every friend who picked it, most recent first, with what they said about it.
  pickedBy: { friend: Picker; note: string | null; addedAt: Date }[]
}

const FEED_LIMIT = 40

type FeedRow = MediaItem & { note: string | null; addedAt: Date; ownerId: string }

// What your friends have added to their picks lately, one card per title however many picked it.
// One query for the picks (it finds your friends itself), one for the pickers' profiles.
export async function friendsPicksFeed(userId: string): Promise<FriendsPick[]> {
  const rows = await prisma.$queryRaw<FeedRow[]>`
    WITH friends AS (${friendIdsSql(userId)})
    SELECT m.*, i."note", i."addedAt", c."ownerId"
    FROM "CollectionItem" i
    JOIN "Collection" c ON c."id" = i."collectionId" AND c."kind" = 'picks'
    JOIN friends f ON f.id = c."ownerId"
    JOIN "MediaItem" m ON m."id" = i."mediaItemId"
    ORDER BY i."addedAt" DESC
    LIMIT ${FEED_LIMIT}
  `
  if (rows.length === 0) return []

  const profiles = await prisma.profile.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.ownerId))] } },
    select: { id: true, username: true, avatarUrl: true },
  })
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))

  const byMediaItem = new Map<string, FriendsPick>()
  for (const { note, addedAt, ownerId, ...mediaItem } of rows) {
    const friend = profileById.get(ownerId)
    if (!friend) continue
    const pick = byMediaItem.get(mediaItem.id) ?? { mediaItem, pickedBy: [] }
    pick.pickedBy.push({ friend, note, addedAt })
    byMediaItem.set(mediaItem.id, pick)
  }
  return [...byMediaItem.values()]
}
