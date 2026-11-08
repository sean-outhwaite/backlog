import { describe, expect, it } from 'vitest'
import { matchGame, mergeEntries } from './remapGames.js'

const game = (externalId: string, title: string, releaseYear: number | null, popularity = 0) => ({
  externalId,
  title,
  releaseYear,
  popularity,
})

describe('matchGame', () => {
  it('matches the one candidate with the same title and year, ignoring case and punctuation', () => {
    const result = matchGame({ title: 'Metal Gear Solid V: The Phantom Pain', releaseYear: 2015 }, [
      game('375', 'Metal Gear Solid', 1998),
      game('1985', 'METAL GEAR SOLID V - The Phantom Pain', 2015),
    ])
    expect(result).toEqual({ status: 'matched', igdbId: '1985', suggestedId: null })
  })

  it('leaves a same-titled game from another year for a person, suggesting it', () => {
    expect(matchGame({ title: 'Hades', releaseYear: 2018 }, [game('113112', 'Hades', 2020)])).toEqual({
      status: 'ambiguous',
      igdbId: null,
      suggestedId: '113112',
    })
  })

  it('takes the one with far more ratings when same-year ports share the title', () => {
    const result = matchGame({ title: 'Final Fantasy VII', releaseYear: 1997 }, [
      game('393025', 'Final Fantasy VII', 1997, 90),
      game('427', 'Final Fantasy VII', 1997, 16420),
    ])
    expect(result).toEqual({ status: 'matched', igdbId: '427', suggestedId: null })
  })

  it('takes the only rated one when the others have no ratings', () => {
    expect(
      matchGame({ title: 'Metroid Prime 2: Echoes', releaseYear: 2004 }, [
        game('360406', 'Metroid Prime 2: Echoes', 2004, 0),
        game('1108', 'Metroid Prime 2: Echoes', 2004, 1950),
      ]).igdbId,
    ).toBe('1108')
  })

  it('is ambiguous when two candidates share the title and year', () => {
    const result = matchGame({ title: 'Prey', releaseYear: 2017 }, [game('1', 'Prey', 2017), game('2', 'Prey', 2017)])
    expect(result).toEqual({ status: 'ambiguous', igdbId: null, suggestedId: '1' })
  })

  it('never matches automatically when the stored game has no year', () => {
    expect(matchGame({ title: 'Hades', releaseYear: null }, [game('113112', 'Hades', 2020)]).status).toBe('ambiguous')
  })

  it('suggests the first candidate when no title matches', () => {
    expect(matchGame({ title: 'GTA 5', releaseYear: 2013 }, [game('1020', 'Grand Theft Auto V', 2013)])).toEqual({
      status: 'ambiguous',
      igdbId: null,
      suggestedId: '1020',
    })
  })

  it('ignores a year RAWG put in the title', () => {
    expect(
      matchGame({ title: 'Prince of Persia (1989)', releaseYear: 1989 }, [game('2472', 'Prince of Persia', 1989)]),
    ).toEqual({
      status: 'matched',
      igdbId: '2472',
      suggestedId: null,
    })
  })

  it('reports no candidates as not found', () => {
    expect(matchGame({ title: 'Nothing', releaseYear: 2000 }, [])).toEqual({
      status: 'not_found',
      igdbId: null,
      suggestedId: null,
    })
  })
})

describe('mergeEntries', () => {
  const entry = (
    id: string,
    status: 'want' | 'in_progress' | 'done',
    addedAt: string,
    notes: string | null = null,
  ) => ({
    id,
    status,
    addedAt: new Date(addedAt),
    notes,
  })

  it('keeps the entry that is further along', () => {
    const { keep, drop } = mergeEntries(entry('rawg', 'want', '2026-01-01'), entry('igdb', 'done', '2026-06-01'))
    expect([keep.id, drop.id]).toEqual(['igdb', 'rawg'])
  })

  it('keeps the earlier entry when both are as far along', () => {
    const { keep } = mergeEntries(
      entry('igdb', 'in_progress', '2026-06-01'),
      entry('rawg', 'in_progress', '2026-01-01'),
    )
    expect(keep.id).toBe('rawg')
  })

  it("fills in the kept entry's notes from the other", () => {
    expect(mergeEntries(entry('a', 'done', '2026-01-01'), entry('b', 'want', '2026-02-01', 'from b')).notes).toBe(
      'from b',
    )
    expect(
      mergeEntries(entry('a', 'done', '2026-01-01', 'from a'), entry('b', 'want', '2026-02-01', 'from b')).notes,
    ).toBe('from a')
  })
})
