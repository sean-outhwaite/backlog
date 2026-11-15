import { describe, expect, it, vi } from 'vitest'

// tmdb.ts reads env (API keys required at import); toTvShowData doesn't use it.
vi.mock('../lib/env.js', () => ({ env: { tmdbApiKey: 'test' } }))

const { toTvShowData } = await import('./tmdb.js')

describe('toTvShowData', () => {
  it('leaves out specials and normalizes seasons', () => {
    const data = toTvShowData({
      status: 'Returning Series',
      last_episode_to_air: { season_number: 2, episode_number: 3 },
      seasons: [
        { season_number: 0, name: 'Specials', episode_count: 4, air_date: '2020-01-01', poster_path: null },
        { season_number: 1, name: 'Season 1', episode_count: 8, air_date: '2021-03-04', poster_path: '/a.jpg' },
        { season_number: 2, name: 'Season 2', episode_count: 8, air_date: null, poster_path: null },
      ],
    })
    expect(data).toEqual({
      seasons: [
        {
          number: 1,
          name: 'Season 1',
          episodeCount: 8,
          airDate: '2021-03-04',
          coverImageUrl: 'https://image.tmdb.org/t/p/w342/a.jpg',
        },
        { number: 2, name: 'Season 2', episodeCount: 8, airDate: null, coverImageUrl: null },
      ],
      lastAired: { season: 2, episode: 3 },
      ended: false,
    })
  })

  it('marks ended and cancelled shows, and ignores a special as the last aired episode', () => {
    expect(toTvShowData({ status: 'Ended', seasons: [] }).ended).toBe(true)
    expect(toTvShowData({ status: 'Canceled', seasons: [] }).ended).toBe(true)
    expect(
      toTvShowData({ status: 'Returning Series', last_episode_to_air: { season_number: 0, episode_number: 2 } })
        .lastAired,
    ).toBeNull()
  })
})
