import type { ListStatus, TrackingMode } from '@prisma/client'

// Pure helpers for TV season and episode tracking: what's aired, and how far someone is through it.

export interface SeasonInfo {
  number: number
  episodeCount: number
  airDate: Date | null
}

export interface ShowAiring {
  lastAiredSeason: number | null
  lastAiredEpisode: number | null
}

export interface SeasonProgressRow {
  season: number
  status: ListStatus
  episodes: number[]
}

export interface ShowProgress {
  done: number
  total: number
  unit: 'season' | 'episode'
  // Where the user is up to: the first season (and, tracking by episode, episode) that's out and
  // not watched yet. Null once they're caught up.
  next: { season: number; episode?: number } | null
}

// Whether a season has premiered: its date has come, or TMDB says an episode of it has aired
// (season dates are sometimes missing when episode dates aren't).
export function isSeasonOut(season: SeasonInfo, show: ShowAiring, now = Date.now()): boolean {
  if (show.lastAiredSeason !== null && season.number <= show.lastAiredSeason) return true
  return season.airDate !== null && season.airDate.getTime() <= now
}

// How many of a season's episodes have aired. Earlier seasons have aired in full, the latest
// one up to its last aired episode. Without TMDB's last aired episode, a season that's out counts whole.
export function airedEpisodes(season: SeasonInfo, show: ShowAiring, now = Date.now()): number {
  if (show.lastAiredSeason === null || show.lastAiredEpisode === null) {
    return isSeasonOut(season, show, now) ? season.episodeCount : 0
  }
  if (season.number < show.lastAiredSeason) return season.episodeCount
  if (season.number === show.lastAiredSeason) return Math.min(show.lastAiredEpisode, season.episodeCount)
  return 0
}

// Episode numbers worth storing for a season: real ones, once each, in order.
export function cleanEpisodes(episodes: number[], episodeCount: number): number[] {
  return [...new Set(episodes)].filter((n) => Number.isInteger(n) && n >= 1 && n <= episodeCount).sort((a, b) => a - b)
}

// A season's status from the episodes watched, tracking by episode: done once all of them are
// (the whole season, not just what's aired, so an airing season stays in progress), started once any is.
export function seasonStatusFromEpisodes(episodes: number[], episodeCount: number): ListStatus {
  const watched = cleanEpisodes(episodes, episodeCount).length
  if (watched === 0) return 'want'
  return episodeCount > 0 && watched >= episodeCount ? 'done' : 'in_progress'
}

// Whether an episode counts as watched: ticked, or its season marked done as a whole.
export function isEpisodeWatched(row: SeasonProgressRow | undefined, episode: number): boolean {
  return !!row && (row.status === 'done' || row.episodes.includes(episode))
}

// The counts derivedSeriesStatus moves the show's entry along by, with seasons as its units: how
// many have premiered, how many of those are done, and how many are started or done.
export function seasonCounts(seasons: SeasonInfo[], show: ShowAiring, rows: SeasonProgressRow[], now = Date.now()) {
  const rowBySeason = new Map(rows.map((row) => [row.season, row]))
  const out = seasons.filter((season) => isSeasonOut(season, show, now))
  return {
    total: out.length,
    done: out.filter((season) => rowBySeason.get(season.number)?.status === 'done').length,
    started: out.filter((season) => rowBySeason.has(season.number)).length,
  }
}

// What a TV entry's card shows: seasons done of those out, or (tracking by episode) aired
// episodes watched, and what's next. Null for whole-show tracking or a show with nothing out.
export function showProgress(
  mode: TrackingMode | null,
  seasons: SeasonInfo[],
  show: ShowAiring,
  rows: SeasonProgressRow[],
  now = Date.now(),
): ShowProgress | null {
  if (mode !== 'season' && mode !== 'episode') return null
  const ordered = [...seasons].sort((a, b) => a.number - b.number)
  const rowBySeason = new Map(rows.map((row) => [row.season, row]))

  if (mode === 'season') {
    const out = ordered.filter((season) => isSeasonOut(season, show, now))
    if (out.length === 0) return null
    const nextSeason = out.find((season) => rowBySeason.get(season.number)?.status !== 'done')
    return {
      unit: 'season',
      total: out.length,
      done: out.length - out.filter((season) => rowBySeason.get(season.number)?.status !== 'done').length,
      next: nextSeason ? { season: nextSeason.number } : null,
    }
  }

  let total = 0
  let done = 0
  let next: ShowProgress['next'] = null
  for (const season of ordered) {
    const aired = airedEpisodes(season, show, now)
    const row = rowBySeason.get(season.number)
    for (let episode = 1; episode <= aired; episode++) {
      total++
      if (isEpisodeWatched(row, episode)) done++
      else next ??= { season: season.number, episode }
    }
  }
  return total === 0 ? null : { unit: 'episode', total, done, next }
}
