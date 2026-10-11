import type { MediaItem } from '@prisma/client'
import { prisma } from './prisma.js'
import { providersByType } from '../providers/index.js'
import type { NormalizedMediaResult } from '../providers/types.js'

// How many titles one run re-checks, and how long it may take: the cron function has a minute, and
// Open Library allows a few requests a second. Pending titles are checked oldest-checked first,
// so with a daily run every one comes round within a few days even if there are more than this.
const BATCH_SIZE = 60
const TIME_BUDGET_MS = 40_000
const CONCURRENCY = 3

// The MediaItem columns for a title's release, from what its provider says now. A title stored
// while still to come is marked checked, so its release can be announced (see checkReleases).
export function releaseColumns(result: Pick<NormalizedMediaResult, 'releaseDate' | 'unreleased'>) {
  return {
    releaseDate: result.releaseDate ? new Date(`${result.releaseDate}T00:00:00Z`) : null,
    releasePending: result.unreleased,
    releaseCheckedAt: result.unreleased ? new Date() : null,
  }
}

// Whether a title can be watched/read/played yet. One never seen as upcoming (stored before
// release tracking, and not yet checked) counts as out, as does one whose date has arrived but
// hasn't been re-checked since.
export function isOut(item: Pick<MediaItem, 'releasePending' | 'releaseDate' | 'releaseCheckedAt'>): boolean {
  if (!item.releasePending || !item.releaseCheckedAt) return true
  return item.releaseDate !== null && item.releaseDate.getTime() <= Date.now()
}

// The same as a Prisma filter, for counting a series' volumes that are out.
export function isOutWhere() {
  return {
    OR: [{ releasePending: false }, { releaseCheckedAt: null }, { releaseDate: { lte: new Date() } }],
  }
}

export interface ReleaseCheckSummary {
  checked: number
  released: string[]
  failed: number
}

// The daily job: re-fetches tracked titles that weren't out yet, updates their dates (they move),
// and for each that's now out, tells everyone tracking it, directly or through a series. A title
// is only announced if an earlier check saw it as upcoming, so the backfill (and anything already
// out by the time it was first checked) stays quiet.
export async function checkReleases(): Promise<ReleaseCheckSummary> {
  const startedAt = Date.now()
  const candidates = await prisma.mediaItem.findMany({
    where: {
      kind: 'title',
      releasePending: true,
      OR: [{ listEntries: { some: {} } }, { inSeries: { some: { series: { listEntries: { some: {} } } } } }],
    },
    orderBy: { releaseCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: BATCH_SIZE,
  })

  const summary: ReleaseCheckSummary = { checked: 0, released: [], failed: 0 }
  const queue = [...candidates]
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) return
      try {
        if (await checkOne(item)) summary.released.push(item.title)
        summary.checked++
      } catch (error) {
        summary.failed++
        console.warn(`Release check for ${item.id} failed:`, error)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  return summary
}

// Returns whether this check found the title newly out (and announced it).
async function checkOne(item: MediaItem): Promise<boolean> {
  const details = await providersByType[item.type].getById(item.externalId)
  if (!details) {
    // Gone from the provider: stop asking about it.
    await prisma.mediaItem.update({ where: { id: item.id }, data: { releasePending: false } })
    return false
  }

  const wasSeenUpcoming = item.releaseCheckedAt !== null
  const { releaseDate, releasePending } = releaseColumns(details)
  await prisma.mediaItem.update({
    where: { id: item.id },
    data: {
      releaseDate,
      releasePending,
      releaseYear: details.releaseYear,
      releaseCheckedAt: new Date(),
      // Upcoming titles often only get their artwork nearer the date.
      ...(details.coverImageUrl && { coverImageUrl: details.coverImageUrl }),
    },
  })
  if (releasePending || !wasSeenUpcoming) return false

  await announceRelease(item)
  return true
}

// A title is out: anyone with it on their list (and not already done with it) or with a series
// it's in gets a notification, and those series' finished entries move back to in progress.
async function announceRelease(item: MediaItem) {
  const links = await prisma.seriesVolume.findMany({ where: { volumeId: item.id }, select: { seriesId: true } })
  const seriesIds = links.map((link) => link.seriesId)

  const [entries] = await Promise.all([
    prisma.listEntry.findMany({
      where: { mediaItemId: { in: [item.id, ...seriesIds] } },
      select: { userId: true, status: true, mediaItemId: true },
    }),
    seriesIds.length > 0
      ? prisma.listEntry.updateMany({
          where: { mediaItemId: { in: seriesIds }, status: 'done' },
          data: { status: 'in_progress', completedAt: null },
        })
      : null,
  ])

  const userIds = new Set(
    entries.filter((entry) => entry.mediaItemId !== item.id || entry.status !== 'done').map((entry) => entry.userId),
  )
  if (userIds.size === 0) return
  await prisma.notification.createMany({
    data: [...userIds].map((userId) => ({ userId, type: 'released' as const, mediaItemId: item.id })),
  })
}
