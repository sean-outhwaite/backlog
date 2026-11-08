import 'dotenv/config'
import { readFile, writeFile } from 'node:fs/promises'
import type { MediaItem, Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma.js'
import { releaseColumns } from '../lib/releases.js'
import { matchGame, mergeEntries, searchTitle, type MatchStatus } from '../lib/remapGames.js'
import { igdbProvider } from '../providers/igdb.js'
import type { MediaDetails } from '../providers/types.js'

// One-off: moves games stored from RAWG (down since November 2026) onto IGDB, keeping each row's
// id so lists, picks, recommendations and notifications keep pointing at it.
//
//   pnpm exec tsx src/scripts/remapRawgGames.ts            dry run: writes rawg-remap.json, changes nothing
//   pnpm exec tsx src/scripts/remapRawgGames.ts --apply    applies rawg-remap.json as edited
//
// The dry run searches IGDB for each RAWG game and fills in igdbId only for a confident match (same
// title and year). Review the file: set igdbId for the ambiguous ones (suggestedId and candidates
// help), or null to leave a game on RAWG, where it shows from stored data. --apply reads the file
// rather than searching again, so what's applied is exactly what was reviewed. A game whose IGDB
// row already exists (someone added it since the switch, or two RAWG rows chose the same game) is
// merged into that row instead. Run it from server/ against the session pooler, like migrations.

const REPORT_PATH = 'rawg-remap.json'
// IGDB allows 4 requests a second per client id, shared with the live app.
const REQUEST_GAP_MS = 400

interface ReportRow {
  mediaItemId: string
  title: string
  releaseYear: number | null
  // People with it on their backlog or a list, or who were recommended it, so the ones that
  // matter most get reviewed first.
  users: number
  status: MatchStatus
  // Merged into an existing IGDB row rather than updated in place.
  collision: 'existing_row' | 'duplicate_match' | null
  igdbId: string | null
  suggestedId: string | null
  candidates: Array<{ igdbId: string; title: string; releaseYear: number | null; url: string }>
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function rawgGames() {
  return prisma.mediaItem.findMany({
    where: { source: 'rawg' },
    include: {
      listEntries: { select: { userId: true } },
      collectionItems: { select: { collection: { select: { ownerId: true } } } },
      recommendations: { select: { toUserId: true } },
    },
    orderBy: { title: 'asc' },
  })
}

async function dryRun() {
  const rows = await rawgGames()
  const report: ReportRow[] = []
  for (const row of rows) {
    if (row.type !== 'game' || row.kind !== 'title')
      throw new Error(`Unexpected RAWG row ${row.id}: ${row.type} ${row.kind}`)
    const candidates = await igdbProvider.search(searchTitle(row.title))
    await sleep(REQUEST_GAP_MS)
    const match = matchGame(row, candidates)
    const users = new Set([
      ...row.listEntries.map((entry) => entry.userId),
      ...row.collectionItems.map((item) => item.collection.ownerId),
      ...row.recommendations.map((recommendation) => recommendation.toUserId),
    ])
    report.push({
      mediaItemId: row.id,
      title: row.title,
      releaseYear: row.releaseYear,
      users: users.size,
      ...match,
      collision: null,
      // The top five, plus the chosen or suggested one when it's further down.
      candidates: candidates
        .filter((candidate, i) => i < 5 || [match.igdbId, match.suggestedId].includes(candidate.externalId))
        .map((candidate) => ({
          igdbId: candidate.externalId,
          title: candidate.title,
          releaseYear: candidate.releaseYear,
          url: `https://www.igdb.com/search?q=${encodeURIComponent(candidate.title)}`,
        })),
    })
  }

  await markCollisions(report)
  report.sort((a, b) => order(a) - order(b) || b.users - a.users)
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)

  const count = (status: MatchStatus) => report.filter((row) => row.status === status).length
  console.log(
    `${report.length} RAWG games: ${count('matched')} matched, ${count('ambiguous')} ambiguous, ${count('not_found')} not found, ` +
      `${report.filter((row) => row.collision).length} to merge. Wrote ${REPORT_PATH}.`,
  )
  for (const row of report) {
    const chosen = row.igdbId ? `→ ${row.igdbId}` : row.suggestedId ? `? ${row.suggestedId}` : '✗'
    const top = row.candidates.find((candidate) => candidate.igdbId === (row.igdbId ?? row.suggestedId))
    console.log(
      `  ${row.status.padEnd(9)} ${chosen.padEnd(10)} ${row.title} (${row.releaseYear ?? '?'}, ${row.users} users)` +
        (top && !row.igdbId ? `  ≈ ${top.title} (${top.releaseYear ?? '?'})` : '') +
        (row.collision ? `  [merge: ${row.collision}]` : ''),
    )
  }
}

// Ambiguous first, since those need a decision, then not found, then matched.
const order = (row: ReportRow) => ({ ambiguous: 0, not_found: 1, matched: 2 })[row.status]

// Flags games that will merge rather than update in place: the IGDB row exists already, or another
// RAWG row is moving to the same IGDB game.
async function markCollisions(report: ReportRow[]) {
  const chosen = report.filter((row) => row.igdbId)
  const existing = await prisma.mediaItem.findMany({
    where: { source: 'igdb', type: 'game', kind: 'title', externalId: { in: chosen.map((row) => row.igdbId!) } },
    select: { externalId: true },
  })
  const existingIds = new Set(existing.map((item) => item.externalId))
  const seen = new Set<string>()
  for (const row of chosen) {
    if (existingIds.has(row.igdbId!)) row.collision = 'existing_row'
    else if (seen.has(row.igdbId!)) row.collision = 'duplicate_match'
    seen.add(row.igdbId!)
  }
}

async function apply() {
  const report = JSON.parse(await readFile(REPORT_PATH, 'utf8')) as ReportRow[]
  const todo = report.filter((row) => row.igdbId)
  console.log(`Applying ${todo.length} of ${report.length} (the rest stay on RAWG).`)
  let moved = 0
  let merged = 0
  for (const row of todo) {
    const item = await prisma.mediaItem.findUnique({ where: { id: row.mediaItemId } })
    if (!item || item.source !== 'rawg') {
      console.log(`  skip ${row.title}: already moved or gone`)
      continue
    }
    const details = await igdbProvider.getById(row.igdbId!)
    await sleep(REQUEST_GAP_MS)
    if (!details) {
      console.log(`  skip ${row.title}: IGDB has no game ${row.igdbId}`)
      continue
    }
    const target = await prisma.mediaItem.findUnique({
      where: {
        source_type_kind_externalId: { source: 'igdb', type: 'game', kind: 'title', externalId: details.externalId },
      },
    })
    if (target) {
      await prisma.$transaction((tx) => mergeInto(tx, item, target), { timeout: 30_000 })
      merged++
      console.log(`  merged ${row.title} into ${target.title} (${target.id})`)
    } else {
      await prisma.mediaItem.update({ where: { id: item.id }, data: igdbColumns(item, details) })
      moved++
      console.log(`  moved  ${row.title} → ${details.title} (${details.externalId})`)
    }
  }
  console.log(`Done: ${moved} moved, ${merged} merged.`)
}

// The row as IGDB has it now. A title already seen as upcoming keeps its releaseCheckedAt, so its
// release is still announced when it comes out.
function igdbColumns(item: MediaItem, details: MediaDetails) {
  const release = releaseColumns(details)
  return {
    source: 'igdb' as const,
    externalId: details.externalId,
    title: details.title,
    coverImageUrl: details.coverImageUrl,
    description: details.description,
    releaseYear: details.releaseYear,
    releaseDate: release.releaseDate,
    releasePending: release.releasePending,
    releaseCheckedAt: item.releaseCheckedAt ?? release.releaseCheckedAt,
  }
}

// Points everything at `from` (the RAWG row) at `into` (the IGDB row), then deletes `from`. Where
// someone has both on their backlog, or both in one list, the two become one.
async function mergeInto(tx: Prisma.TransactionClient, from: MediaItem, into: MediaItem) {
  const [volumes, progress] = await Promise.all([
    tx.seriesVolume.count({ where: { OR: [{ seriesId: from.id }, { volumeId: from.id }] } }),
    tx.volumeProgress.count({ where: { volumeId: from.id } }),
  ])
  // Games have no series here (RAWG's series data was never used), so this should never happen.
  if (volumes || progress) throw new Error(`${from.id} is part of a series; merge it by hand`)

  const entries = await tx.listEntry.findMany({ where: { mediaItemId: { in: [from.id, into.id] } } })
  for (const entry of entries.filter((e) => e.mediaItemId === from.id)) {
    const other = entries.find((e) => e.mediaItemId === into.id && e.userId === entry.userId)
    if (!other) {
      await tx.listEntry.update({ where: { id: entry.id }, data: { mediaItemId: into.id } })
      continue
    }
    const { keep, drop, notes } = mergeEntries(entry, other)
    await tx.listEntry.delete({ where: { id: drop.id } })
    await tx.listEntry.update({ where: { id: keep.id }, data: { mediaItemId: into.id, notes } })
  }

  const items = await tx.collectionItem.findMany({ where: { mediaItemId: { in: [from.id, into.id] } } })
  for (const item of items.filter((i) => i.mediaItemId === from.id)) {
    const other = items.find((i) => i.mediaItemId === into.id && i.collectionId === item.collectionId)
    const key = { collectionId_mediaItemId: { collectionId: item.collectionId, mediaItemId: item.mediaItemId } }
    if (!other) {
      await tx.collectionItem.update({ where: key, data: { mediaItemId: into.id } })
      continue
    }
    await tx.collectionItem.delete({ where: key })
    if (!other.note && item.note) {
      await tx.collectionItem.update({
        where: { collectionId_mediaItemId: { collectionId: other.collectionId, mediaItemId: into.id } },
        data: { note: item.note },
      })
    }
  }

  await tx.recommendation.updateMany({ where: { mediaItemId: from.id }, data: { mediaItemId: into.id } })
  await tx.notification.updateMany({ where: { mediaItemId: from.id }, data: { mediaItemId: into.id } })
  await tx.mediaItem.delete({ where: { id: from.id } })
}

try {
  await (process.argv.includes('--apply') ? apply() : dryRun())
} finally {
  await prisma.$disconnect()
}
