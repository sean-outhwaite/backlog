import { describe, expect, it } from 'vitest'
import type { MediaSearchResult } from '../providers/types.js'
import { pickSeeds, rankForYou, type HistoryRow, type Seed } from './forYouRanking.js'

const day = (n: number) => new Date(Date.UTC(2026, 0, n))

function row(externalId: string, overrides: Partial<HistoryRow> = {}): HistoryRow {
  return {
    source: 'tmdb',
    type: 'movie',
    externalId,
    title: `Title ${externalId}`,
    status: 'done',
    at: day(1),
    ...overrides,
  }
}

function result(externalId: string, overrides: Partial<MediaSearchResult> = {}): MediaSearchResult {
  return {
    externalId,
    type: 'movie',
    title: `Result ${externalId}`,
    coverImageUrl: 'https://example.com/cover.jpg',
    description: null,
    releaseYear: 2020,
    releaseDate: null,
    unreleased: false,
    popularity: 100,
    ...overrides,
  }
}

const seed = (externalId: string, title = `Seed ${externalId}`, type: Seed['type'] = 'movie'): Seed => ({
  source: type === 'game' ? 'igdb' : 'tmdb',
  type,
  externalId,
  title,
})

const always = () => true

describe('pickSeeds', () => {
  it('takes the most recently started or finished titles of each type, leaving out books', () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, i) => row(`m${i}`, { at: day(i + 1) })),
      row('b1', { type: 'book', source: 'openlibrary' }),
      row('g1', { type: 'game', source: 'igdb', status: 'in_progress' }),
    ]
    const seeds = pickSeeds(rows, always)
    expect(seeds.map((s) => s.externalId)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3', 'm2', 'g1'])
  })

  it('fills in with wanted titles when few are started or finished', () => {
    const rows = [
      row('done'),
      row('old-want', { status: 'want', at: day(2) }),
      row('new-want', { status: 'want', at: day(3) }),
    ]
    expect(pickSeeds(rows, always).map((s) => s.externalId)).toEqual(['done', 'new-want', 'old-want'])
  })

  it('ignores wanted titles once there are enough started or finished ones', () => {
    const rows = [row('a'), row('b'), row('c'), row('w', { status: 'want', at: day(9) })]
    expect(pickSeeds(rows, always).map((s) => s.externalId)).toEqual(['a', 'b', 'c'])
  })

  it('counts a title once when it is both listed and a series volume', () => {
    const rows = [row('a', { at: day(2) }), row('a', { status: 'want' })]
    expect(pickSeeds(rows, always)).toHaveLength(1)
  })

  it('skips titles from a source that can no longer be fetched', () => {
    const rows = [row('old', { type: 'game', source: 'tmdb' }), row('new', { type: 'game', source: 'igdb' })]
    const seeds = pickSeeds(rows, (source, type) => !(type === 'game' && source === 'tmdb'))
    expect(seeds.map((s) => s.externalId)).toEqual(['new'])
  })
})

describe('rankForYou', () => {
  it('ranks a title suggested by more of your titles first, saying which', () => {
    const ranked = rankForYou(
      [
        { seed: seed('1', 'Alien'), results: [result('x'), result('shared')] },
        { seed: seed('2', 'Aliens'), results: [result('y'), result('shared')] },
      ],
      new Set(),
    )
    expect(ranked[0].externalId).toBe('shared')
    expect(ranked[0].because).toEqual(['Alien', 'Aliens'])
    expect(ranked.map((r) => r.externalId)).toHaveLength(3)
  })

  it('orders titles from one seed by position, then popularity', () => {
    const ranked = rankForYou(
      [
        {
          seed: seed('1'),
          results: [
            result('first'),
            result('second'),
            result('obscure', { popularity: 0 }),
            result('hit', { popularity: 30000 }),
          ],
        },
      ],
      new Set(),
    )
    expect(ranked.map((r) => r.externalId)).toEqual(['hit', 'first', 'second', 'obscure'])
  })

  it('ranks a title two of yours suggest, last on both lists, above the biggest hit only one does', () => {
    const filler = (prefix: string) => Array.from({ length: 3 }, (_, i) => result(`${prefix}${i}`))
    const ranked = rankForYou(
      [
        {
          seed: seed('1'),
          results: [result('hit', { popularity: 40000 }), ...filler('a'), result('both', { popularity: 0 })],
        },
        { seed: seed('2'), results: [...filler('b'), result('both', { popularity: 0 })] },
      ],
      new Set(),
    )
    expect(ranked[0].externalId).toBe('both')
    expect(ranked[1].externalId).toBe('hit')
  })

  it('leaves out titles on your list and ones with no cover or date', () => {
    const ranked = rankForYou(
      [
        {
          seed: seed('1'),
          results: [
            result('listed'),
            result('no-cover', { coverImageUrl: null }),
            result('no-date', { releaseYear: null }),
            result('ok'),
          ],
        },
      ],
      new Set(['movie:listed']),
    )
    expect(ranked.map((r) => r.externalId)).toEqual(['ok'])
  })

  it('keeps types apart by id and gives each a share, strongest type first', () => {
    const movies = Array.from({ length: 20 }, (_, i) => result(`${i}`))
    const ranked = rankForYou(
      [
        { seed: seed('1'), results: movies },
        { seed: seed('2'), results: movies },
        { seed: seed('g', 'Game', 'game'), results: [result('0', { type: 'game' })] },
      ],
      new Set(),
    )
    expect(ranked.filter((r) => r.type === 'movie')).toHaveLength(8)
    expect(ranked.map((r) => `${r.type}:${r.externalId}`).slice(0, 3)).toEqual(['movie:0', 'game:0', 'movie:1'])
  })
})
