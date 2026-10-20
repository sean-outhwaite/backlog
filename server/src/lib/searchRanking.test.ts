import { describe, expect, it } from 'vitest'
import type { MediaSearchResult } from '../providers/types.js'
import { rankSearchResults } from './searchRanking.js'

function result(title: string, popularity = 0, externalId = title): MediaSearchResult {
  return {
    externalId,
    type: 'movie',
    title,
    coverImageUrl: null,
    description: null,
    releaseYear: null,
    releaseDate: null,
    unreleased: false,
    popularity,
  }
}

const ids = (results: MediaSearchResult[]) => results.map((r) => r.externalId)

describe('rankSearchResults', () => {
  it('puts an exact title match before a prefix match before partial overlap', () => {
    const ranked = rankSearchResults(
      [result('Potter Family Cookbook'), result('Harry Potter and the Goblet of Fire'), result('Harry Potter')],
      'harry potter',
    )
    expect(ids(ranked)).toEqual(['Harry Potter', 'Harry Potter and the Goblet of Fire', 'Potter Family Cookbook'])
  })

  it('ignores case, punctuation and accents when matching', () => {
    const ranked = rankSearchResults(
      [result('Metal Gear'), result('METAL GEAR SOLID:'), result('Pokémon')],
      'metal gear solid',
    )
    expect(ranked[0].title).toBe('METAL GEAR SOLID:')
    expect(rankSearchResults([result('Metal Gear'), result('Pokémon')], 'pokemon')[0].title).toBe('Pokémon')
  })

  it('only counts a prefix match on a word boundary', () => {
    // "harry pottery" doesn't start with "harry potter " so it's only a partial match (half the words).
    const ranked = rankSearchResults([result('Harry Pottery'), result('Harry Potter Collection')], 'harry potter')
    expect(ids(ranked)).toEqual(['Harry Potter Collection', 'Harry Pottery'])
  })

  it('uses popularity to separate exact matches from different providers', () => {
    const ranked = rankSearchResults(
      [result('Metal Gear Solid', 3, 'fan-film'), result('Metal Gear Solid', 5000, 'game')],
      'Metal Gear Solid',
    )
    expect(ids(ranked)).toEqual(['game', 'fan-film'])
  })

  it('lets a very popular prefix match outrank an obscure exact match', () => {
    // exact: 3 + log10(2) ≈ 3.3; prefix: 2.5 + log10(10001) ≈ 6.5
    const ranked = rankSearchResults([result('Dune', 1), result('Dune Part Two', 10_000)], 'dune')
    expect(ids(ranked)).toEqual(['Dune Part Two', 'Dune'])
  })

  it("doesn't let a popular title that shares no query words float to the top", () => {
    const ranked = rankSearchResults([result('Atomic Habits', 1_000_000), result('Breaking Bad', 1)], 'breaking bad')
    expect(ids(ranked)).toEqual(['Breaking Bad', 'Atomic Habits'])
  })

  it('scales popularity by query coverage', () => {
    // third: 2/3 + 1/3 * log10(1001) ≈ 1.67; full: 2 + log10(2) ≈ 2.3. Unscaled, the popular
    // third-of-a-match would score ≈ 3.67 and win.
    const ranked = rankSearchResults(
      [result('The Witcher', 1000, 'third'), result('Wild Hunt Witcher', 1, 'full')],
      'witcher wild hunt',
    )
    expect(ids(ranked)).toEqual(['full', 'third'])
  })

  it('keeps provider order for ties', () => {
    const ranked = rankSearchResults(
      [result('Alien', 50, 'a'), result('Alien', 50, 'b'), result('Alien', 50, 'c')],
      'alien',
    )
    expect(ids(ranked)).toEqual(['a', 'b', 'c'])
  })

  it('treats zero popularity as no boost', () => {
    const ranked = rankSearchResults([result('Alien', 0, 'zero'), result('Alien', 1, 'one')], 'alien')
    expect(ids(ranked)).toEqual(['one', 'zero'])
  })

  it('keeps provider order when the query is empty or only punctuation', () => {
    const input = [result('B', 1), result('A', 1000), result('C', 50)]
    expect(ids(rankSearchResults(input, ''))).toEqual(['B', 'A', 'C'])
    expect(ids(rankSearchResults(input, '  ?!  '))).toEqual(['B', 'A', 'C'])
  })

  it("doesn't mutate its input and handles an empty list", () => {
    const input = [result('Zelda'), result('Zelda Breath of the Wild', 10)]
    const before = [...input]
    rankSearchResults(input, 'zelda breath of the wild')
    expect(input).toEqual(before)
    expect(rankSearchResults([], 'anything')).toEqual([])
  })
})
