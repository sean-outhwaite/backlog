import { describe, expect, it } from 'vitest'
import {
  airedEpisodes,
  cleanEpisodes,
  isSeasonOut,
  seasonCounts,
  seasonStatusFromEpisodes,
  showProgress,
  type SeasonInfo,
} from './tvProgress.js'

const NOW = new Date('2026-11-16T12:00:00Z').getTime()
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

// Season 3 is airing (episode 4 of 8 is the latest), season 4 is announced for next year.
const seasons: SeasonInfo[] = [
  { number: 1, episodeCount: 10, airDate: day('2022-01-01') },
  { number: 2, episodeCount: 10, airDate: day('2024-01-01') },
  { number: 3, episodeCount: 8, airDate: day('2026-10-26') },
  { number: 4, episodeCount: 8, airDate: day('2027-06-01') },
]
const show = { lastAiredSeason: 3, lastAiredEpisode: 4 }

describe('isSeasonOut', () => {
  it('goes by the premiere date', () => {
    expect(isSeasonOut(seasons[2], show, NOW)).toBe(true)
    expect(isSeasonOut(seasons[3], show, NOW)).toBe(false)
  })

  it("counts a season out when TMDB says it's aired, even without a date", () => {
    expect(isSeasonOut({ number: 2, episodeCount: 6, airDate: null }, show, NOW)).toBe(true)
    expect(isSeasonOut({ number: 5, episodeCount: 6, airDate: null }, show, NOW)).toBe(false)
  })
})

describe('airedEpisodes', () => {
  it('counts earlier seasons whole, the airing one so far, later ones not at all', () => {
    expect(seasons.map((season) => airedEpisodes(season, show, NOW))).toEqual([10, 10, 4, 0])
  })

  it('falls back to whole seasons that are out without a last aired episode', () => {
    const unknown = { lastAiredSeason: null, lastAiredEpisode: null }
    expect(seasons.map((season) => airedEpisodes(season, unknown, NOW))).toEqual([10, 10, 8, 0])
  })
})

describe('cleanEpisodes and seasonStatusFromEpisodes', () => {
  it('drops duplicates and episodes the season does not have', () => {
    expect(cleanEpisodes([3, 1, 3, 0, 11, 2.5], 10)).toEqual([1, 3])
  })

  it('is done only once every episode of the season is watched', () => {
    expect(seasonStatusFromEpisodes([], 8)).toBe('want')
    expect(seasonStatusFromEpisodes([1, 2, 3, 4], 8)).toBe('in_progress')
    expect(seasonStatusFromEpisodes([1, 2, 3, 4, 5, 6, 7, 8], 8)).toBe('done')
  })
})

describe('seasonCounts', () => {
  it('counts only seasons that are out', () => {
    const rows = [
      { season: 1, status: 'done' as const, episodes: [] },
      { season: 3, status: 'in_progress' as const, episodes: [1] },
    ]
    expect(seasonCounts(seasons, show, rows, NOW)).toEqual({ total: 3, done: 1, started: 2 })
  })
})

describe('showProgress', () => {
  it('is nothing when tracking the whole show', () => {
    expect(showProgress('show', seasons, show, [], NOW)).toBeNull()
    expect(showProgress(null, seasons, show, [], NOW)).toBeNull()
  })

  it('counts seasons, tracking by season', () => {
    const rows = [{ season: 1, status: 'done' as const, episodes: [] }]
    expect(showProgress('season', seasons, show, rows, NOW)).toEqual({
      unit: 'season',
      done: 1,
      total: 3,
      next: { season: 2 },
    })
  })

  it('counts aired episodes, with done seasons counting whole, tracking by episode', () => {
    const rows = [
      { season: 1, status: 'done' as const, episodes: [] },
      { season: 2, status: 'in_progress' as const, episodes: [1, 2, 4] },
    ]
    expect(showProgress('episode', seasons, show, rows, NOW)).toEqual({
      unit: 'episode',
      done: 13,
      total: 24,
      next: { season: 2, episode: 3 },
    })
  })

  it('has no next episode once caught up with what has aired', () => {
    const rows = [
      { season: 1, status: 'done' as const, episodes: [] },
      { season: 2, status: 'done' as const, episodes: [] },
      { season: 3, status: 'in_progress' as const, episodes: [1, 2, 3, 4] },
    ]
    expect(showProgress('episode', seasons, show, rows, NOW)?.next).toBeNull()
  })

  it('is nothing for a show with nothing out yet', () => {
    expect(showProgress('season', [seasons[3]], { lastAiredSeason: null, lastAiredEpisode: null }, [], NOW)).toBeNull()
  })
})
