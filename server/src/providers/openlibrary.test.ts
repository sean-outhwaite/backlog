import { afterEach, describe, expect, it, vi } from 'vitest'

// env.ts throws at import without the other providers' API keys, which Open Library doesn't use.
vi.mock('../lib/env.js', () => ({ env: {} }))

const { env } = (await import('../lib/env.js')) as unknown as { env: { nytApiKey?: string } }
const { bestsellerQuery, matchBestsellers, openLibraryProvider } = await import('./openlibrary.js')

// Answers each request with the first route whose pattern its URL matches.
function stubFetch(routes: [RegExp, unknown][]) {
  const fetchMock = vi.fn(async (url: string | URL) => {
    const route = routes.find(([pattern]) => pattern.test(String(url)))
    return route ? new Response(JSON.stringify(route[1]), { status: 200 }) : new Response('not found', { status: 404 })
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

  it('strips Markdown headings, emphasis and rule lines from descriptions', async () => {
    const description = [
      "***He can resist any woman in the world...except for the one he shouldn't want.***",
      '',
      '* * *',
      '',
      '## About the book',
      'Famed **goalkeeper** Noah Wilson reads _Dune_ and __The Hobbit__, not snake_case_names or 2*3*4.',
    ].join('\n')
    stubFetch([
      [/\/works\/OL1W\.json/, { title: 'The Keeper', description }],
      [/search\.json/, { docs: [editions('The Keeper', ['eng'])] }],
    ])
    const details = await openLibraryProvider.getById('OL1W')
    expect(details?.description).toBe(
      [
        "He can resist any woman in the world...except for the one he shouldn't want.",
        '',
        'About the book',
        'Famed goalkeeper Noah Wilson reads Dune and The Hobbit, not snake_case_names or 2*3*4.',
      ].join('\n'),
    )
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

describe('bestsellerQuery', () => {
  it('searches every ISBN at once, then each title with its lead author surname', () => {
    const query = bestsellerQuery([
      { title: "THE KEEPER'S SON", author: 'Michael Douglas with Shane Salerno', isbns: ['111', '222'] },
      { title: 'WTF AMERICA?!', author: 'Ben Meiselas, Brett Meiselas', isbns: ['222'] },
    ])
    expect(query).toBe(
      'isbn:(111 OR 222) OR (title:"the keeper s son" AND author:douglas) OR (title:"wtf america" AND author:meiselas)',
    )
  })
})

describe('matchBestsellers', () => {
  const book = (title: string, author: string, isbns: string[] = []) => ({ title, author, isbns })

  it('matches by ISBN, else by title and surname, in bestseller order, each work once', () => {
    const docs = [
      { key: '/works/A', title: 'A Court of Thorns and Roses', isbn: ['111'] },
      { key: '/works/B', title: 'The Hollow: A Novel', author_name: ['Michael Connelly'] },
      { key: '/works/C', title: 'The Hollow', author_name: ['Someone Else'] },
    ]
    const matched = matchBestsellers(
      [
        book('THE HOLLOW', 'Michael Connelly'),
        book('A COURT OF THORNS AND ROSES', 'Sarah J. Maas', ['999', '111']),
        book('A COURT OF THORNS AND ROSES', 'Sarah J. Maas', ['111']),
        book('PARTITA', 'Barbara Kingsolver', ['555']),
      ],
      docs,
    )
    expect(matched.map((doc) => doc.key)).toEqual(['/works/B', '/works/A'])
  })
})

describe('openLibraryProvider.popular', () => {
  afterEach(() => {
    delete env.nytApiKey
  })

  it("uses Open Library's trending works without an NYT key", async () => {
    const fetchMock = stubFetch([
      [/\/trending\/weekly\.json/, { works: [{ key: '/works/OL1W', title: 'Atomic Habits' }] }],
    ])
    const results = await openLibraryProvider.popular()
    expect(results.map((r) => r.title)).toEqual(['Atomic Habits'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses the NYT bestsellers with covers, matched to works in one search, with a key', async () => {
    env.nytApiKey = 'nyt-key'
    const overview = {
      results: {
        lists: [
          {
            list_name_encoded: 'combined-print-and-e-book-fiction',
            books: [
              { title: 'VERITY', author: 'Colleen Hoover', primary_isbn13: '111', isbns: [{ isbn13: '111' }] },
              { title: 'THE HOLLOW', author: 'Michael Connelly', primary_isbn13: '222', isbns: [{ isbn13: '222' }] },
            ],
          },
        ],
      },
    }
    const fetchMock = stubFetch([
      [/api\.nytimes\.com/, overview],
      [
        /search\.json/,
        {
          docs: [
            { key: '/works/OL2W', title: 'Verity', isbn: ['111'], cover_i: 5 },
            { key: '/works/OL3W', title: 'The Hollow', isbn: ['222'] },
          ],
        },
      ],
    ])
    const results = await openLibraryProvider.popular()
    expect(results.map((r) => [r.externalId, r.title])).toEqual([['OL2W', 'Verity']])
    const urls = fetchMock.mock.calls.map(([url]) => new URL(String(url)))
    expect(urls[0].searchParams.get('api-key')).toBe('nyt-key')
    expect(urls[1].searchParams.get('q')).toContain('isbn:(111 OR 222)')
  })
})
