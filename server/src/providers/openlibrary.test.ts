import { afterEach, describe, expect, it, vi } from 'vitest'

// env.ts throws at import without the other providers' API keys, which Open Library doesn't use.
vi.mock('../lib/env.js', () => ({ env: {} }))

const { openLibraryProvider } = await import('./openlibrary.js')

// Answers each request with the first route whose pattern its URL matches.
function stubFetch(routes: [RegExp, unknown][]) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const route = routes.find(([pattern]) => pattern.test(String(url)))
    return route
      ? new Response(JSON.stringify(route[1]), { status: 200 })
      : new Response('not found', { status: 404 })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// Like stubFetch, with each route's status given, for failures.
function stubRoutes(routes: [RegExp, number, unknown][]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const route = routes.find(([pattern]) => pattern.test(String(url)))
      return route
        ? new Response(JSON.stringify(route[2]), { status: route[1] })
        : new Response('not found', { status: 404 })
    }),
  )
}

const editions = (title: string, language?: string[]) => ({
  editions: { docs: [{ key: '/books/OL1M', title, ...(language && { language }) }] },
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openLibraryProvider.search', () => {
  it('titles a translated work after its English edition', async () => {
    stubFetch([
      [
        /search\.json/,
        {
          docs: [
            { key: '/works/OL1W', title: 'Ostatnie Życzenie', ...editions('The Last Wish', ['eng']) },
            { key: '/works/OL2W', title: 'Rich Dad, Poor Dad', ...editions('Rich dad poor dad', ['eng']) },
            { key: '/works/OL3W', title: 'Sezon burz', ...editions('Sezon Burz', ['pol']) },
            { key: '/works/OL4W', title: 'Lalka', ...editions('Lalka') },
            { key: '/works/OL5W', title: 'Dune' },
          ],
        },
      ],
    ])

    const results = await openLibraryProvider.search('anything')

    expect(results.map((result) => result.title)).toEqual([
      'The Last Wish',
      // Same title, so the work's better-cased spelling is kept.
      'Rich Dad, Poor Dad',
      // No English edition matched.
      'Sezon burz',
      'Lalka',
      'Dune',
    ])
  })
})

describe('openLibraryProvider.getById', () => {
  it("takes a translated work's description from its English edition", async () => {
    const fetchMock = stubFetch([
      [/\/works\/OL1W\.json/, { title: 'Ostatnie Życzenie', description: 'Pozycja, która przedstawia…' }],
      [/search\.json/, { docs: [editions('The Last Wish', ['eng'])] }],
      [/\/books\/OL1M\.json/, { description: { value: 'Geralt the Witcher—revered and hated.' } }],
    ])

    const details = await openLibraryProvider.getById('OL1W')

    expect(details?.title).toBe('The Last Wish')
    expect(details?.description).toBe('Geralt the Witcher—revered and hated.')
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("falls back to the work's description when the edition has none", async () => {
    stubFetch([
      [/\/works\/OL1W\.json/, { title: 'Czas pogardy', description: 'Świat Ciri i wiedźmina…' }],
      [/search\.json/, { docs: [editions('Time of Contempt', ['eng'])] }],
      [/\/books\/OL1M\.json/, {}],
    ])

    const details = await openLibraryProvider.getById('OL1W')

    expect(details?.title).toBe('Time of Contempt')
    expect(details?.description).toBe('Świat Ciri i wiedźmina…')
  })

  it("doesn't fetch the edition of a work already titled in English", async () => {
    const fetchMock = stubFetch([
      [/\/works\/OL1W\.json/, { title: 'Dune', description: 'A desert planet.' }],
      [/search\.json/, { docs: [editions('Dune', ['eng'])] }],
    ])

    const details = await openLibraryProvider.getById('OL1W')

    expect(details?.title).toBe('Dune')
    expect(details?.description).toBe('A desert planet.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('is null for a work Open Library has no record of', async () => {
    stubFetch([[/search\.json/, { docs: [] }]])

    expect(await openLibraryProvider.getById('OL1W')).toBeNull()
  })

  // The release check stops tracking titles that come back null, so an outage mustn't look like one.
  it('throws when Open Library fails rather than saying the work is gone', async () => {
    stubRoutes([
      [/\/works\/OL1W\.json/, 429, 'rate limited'],
      [/search\.json/, 200, { docs: [] }],
    ])

    await expect(openLibraryProvider.getById('OL1W')).rejects.toThrow('429')
  })

  // The release date comes from the index, so without it an upcoming book would read as out.
  it('throws when only the index lookup fails', async () => {
    stubRoutes([
      [/\/works\/OL1W\.json/, 200, { title: 'Dune' }],
      [/search\.json/, 429, 'rate limited'],
    ])

    await expect(openLibraryProvider.getById('OL1W')).rejects.toThrow('429')
  })
})

describe('openLibraryProvider.getSeries', () => {
  it('is null for a series Open Library has no record of', async () => {
    stubRoutes([
      [/\/series\/OL1L\.json/, 404, 'not found'],
      [/search\.json/, 200, { docs: [] }],
    ])

    expect(await openLibraryProvider.getSeries!('OL1L')).toBeNull()
  })

  it('throws when Open Library fails rather than saying the series is gone', async () => {
    stubRoutes([
      [/\/series\/OL1L\.json/, 503, 'unavailable'],
      [/search\.json/, 200, { docs: [] }],
    ])

    await expect(openLibraryProvider.getSeries!('OL1L')).rejects.toThrow('503')
  })
})
