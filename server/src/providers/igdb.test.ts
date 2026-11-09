import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// env.ts throws at import without every provider's keys; IGDB only needs the Twitch pair.
vi.mock('../lib/env.js', () => ({ env: { twitchClientId: 'client-id', twitchClientSecret: 'secret' } }))

const { igdbProvider, platformLabels, releaseFields, resetIgdbToken } = await import('./igdb.js')
const { ProviderError } = await import('./types.js')

// 2026-11-10 00:00 UTC, as unix seconds.
const NOW = Date.UTC(2026, 10, 10) / 1000
const DAY = 24 * 60 * 60

// Answers the token request, then each IGDB request with the next of `responses` (status, body).
function stubIgdb(responses: Array<[number, unknown]>) {
  const queue = [...responses]
  const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    if (String(url).startsWith('https://id.twitch.tv/')) {
      return new Response(JSON.stringify({ access_token: `token-${fetchMock.mock.calls.length}`, expires_in: 5000000 }))
    }
    const [status, body] = queue.shift() ?? [500, 'unexpected request']
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const igdbCalls = (fetchMock: ReturnType<typeof stubIgdb>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://api.igdb.com/'))
const tokenCalls = (fetchMock: ReturnType<typeof stubIgdb>) =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith('https://id.twitch.tv/'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW * 1000)
  resetIgdbToken()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('igdbProvider.search', () => {
  it('maps games to search results with an https cover and scaled popularity', async () => {
    const fetchMock = stubIgdb([
      [
        200,
        [
          {
            id: 119133,
            name: 'Elden Ring',
            cover: { image_id: 'co4jni' },
            first_release_date: 1645747200,
            release_dates: [{ date: 1645747200, date_format: 0 }],
            total_rating_count: 2345,
            hypes: 96,
            platforms: [
              { id: 6, name: 'PC (Microsoft Windows)', abbreviation: 'PC' },
              { id: 48, name: 'PlayStation 4', abbreviation: 'PS4' },
              { id: 49, name: 'Xbox One', abbreviation: 'XONE' },
              { id: 167, name: 'PlayStation 5', abbreviation: 'PS5' },
              { id: 169, name: 'Xbox Series X|S', abbreviation: 'Series X|S' },
            ],
          },
        ],
      ],
    ])

    const [result] = await igdbProvider.search('elden ring')

    expect(result).toEqual({
      externalId: '119133',
      type: 'game',
      title: 'Elden Ring',
      coverImageUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co4jni.jpg',
      description: null,
      releaseYear: 2022,
      releaseDate: '2022-02-25',
      unreleased: false,
      platforms: ['PS5', 'Xbox Series', 'PC', 'PS4', 'Xbox One'],
      popularity: 24410,
    })
    const [[url, init]] = igdbCalls(fetchMock)
    expect(url).toBe('https://api.igdb.com/v4/games')
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Client-ID': 'client-id', Authorization: 'Bearer token-1' })
    expect(init?.body).toContain('search "elden ring";')
    expect(init?.body).toContain('version_parent = null')
  })

  it('strips quotes and backslashes from the query, and skips an empty one', async () => {
    const fetchMock = stubIgdb([[200, []]])
    await igdbProvider.search('say "hi" \\ there')
    expect(igdbCalls(fetchMock)[0][1]?.body).toContain('search "say  hi    there";')
    expect(await igdbProvider.search(' "" ')).toEqual([])
    expect(igdbCalls(fetchMock)).toHaveLength(1)
  })

  it('fetches the token once and reuses it', async () => {
    const fetchMock = stubIgdb([
      [200, []],
      [200, []],
    ])
    await Promise.all([igdbProvider.search('a'), igdbProvider.search('b')])
    expect(tokenCalls(fetchMock)).toHaveLength(1)
  })

  it('gets a new token and retries once on a 401', async () => {
    const fetchMock = stubIgdb([
      [401, { message: 'Authorization Failure' }],
      [200, [{ id: 1, name: 'Hades' }]],
    ])
    const results = await igdbProvider.search('hades')
    expect(results.map((r) => r.title)).toEqual(['Hades'])
    expect(tokenCalls(fetchMock)).toHaveLength(2)
    expect(igdbCalls(fetchMock)[1][1]?.headers).toMatchObject({ Authorization: 'Bearer token-3' })
  })

  it('reports a failure as an IGDB POST with its status', async () => {
    stubIgdb([[429, { message: 'Too Many Requests' }]])
    const error = await igdbProvider.search('zelda').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ProviderError)
    expect((error as InstanceType<typeof ProviderError>).status).toBe(429)
    expect((error as Error).message).toBe('IGDB POST /v4/games failed: 429')
  })
})

describe('igdbProvider.getById', () => {
  it('returns null for a non-numeric id without asking IGDB', async () => {
    const fetchMock = stubIgdb([])
    expect(await igdbProvider.getById('12; fields *')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns null when IGDB has no such game', async () => {
    stubIgdb([[200, []]])
    expect(await igdbProvider.getById('999999999')).toBeNull()
  })

  it('maps details, companies and ratings to facts', async () => {
    stubIgdb([
      [
        200,
        [
          {
            id: 119133,
            name: 'Elden Ring',
            summary: 'An action RPG.',
            url: 'https://www.igdb.com/games/elden-ring',
            genres: [{ name: 'Role-playing (RPG)' }, { name: 'Adventure' }],
            platforms: [{ name: 'PC (Microsoft Windows)' }, { name: 'PlayStation 5' }],
            aggregated_rating: 96.9,
            involved_companies: [
              { company: { name: 'Bandai Namco Entertainment' }, developer: false, publisher: true },
              { company: { name: 'FromSoftware' }, developer: true, publisher: true },
            ],
            age_ratings: [
              { organization: { name: 'USK' }, rating_category: { rating: '16' } },
              { organization: { name: 'PEGI' }, rating_category: { rating: '16' } },
              { organization: { name: 'ESRB' }, rating_category: { rating: 'M' } },
            ],
          },
        ],
      ],
    ])

    const details = await igdbProvider.getById('119133')

    expect(details).toMatchObject({
      description: 'An action RPG.',
      url: 'https://www.igdb.com/games/elden-ring',
      genres: ['Role-playing (RPG)', 'Adventure'],
      coverImageUrl: null,
      facts: [
        { label: 'Platforms', value: 'PC (Microsoft Windows), PlayStation 5' },
        { label: 'Developer', value: 'FromSoftware' },
        { label: 'Publisher', value: 'Bandai Namco Entertainment, FromSoftware' },
        { label: 'Critic score', value: '97' },
        { label: 'Age rating', value: 'M (ESRB), 16 (PEGI)' },
      ],
    })
  })
})

describe('platformLabels', () => {
  it('leads with the newest platform per family, then the rest', () => {
    expect(
      platformLabels({
        platforms: [
          { id: 3, name: 'Linux' },
          { id: 130, name: 'Nintendo Switch' },
          { id: 14, name: 'Mac' },
          { id: 6, name: 'PC (Microsoft Windows)' },
          { id: 41, name: 'Wii U' },
        ],
      }),
    ).toEqual(['Switch', 'PC', 'Wii U', 'Mac', 'Linux'])
  })

  it('shows an unknown platform as its short abbreviation, else its name, after the known ones', () => {
    expect(
      platformLabels({
        platforms: [
          { id: 52, name: 'Arcade', abbreviation: 'Arcade' },
          { id: 130, name: 'Nintendo Switch', abbreviation: 'Switch' },
          { id: 15, name: 'Commodore C64/128/MAX', abbreviation: 'C64' },
          { id: 121, name: 'Sharp X68000', abbreviation: 'Sharp X68000' },
        ],
      }),
    ).toEqual(['Switch', 'Arcade', 'C64', 'Sharp X68000'])
    expect(platformLabels({})).toEqual([])
  })

  it('leads with the platform a game came out on first, ahead of later re-releases', () => {
    const platforms = [
      { id: 41, name: 'Wii U' },
      { id: 37, name: 'Nintendo 3DS' },
      { id: 18, name: 'Nintendo Entertainment System' },
    ]
    expect(
      platformLabels({
        platforms,
        release_dates: [
          { platform: 41, date: 1380000000 },
          { platform: 18, date: 652000000 },
          { platform: 37, date: 1360000000 },
          { platform: 18, date: 900000000 },
        ],
      }),
    ).toEqual(['NES', 'Wii U', '3DS'])
    // A same-day launch has no original, so the family order stands.
    expect(
      platformLabels({
        platforms,
        release_dates: [
          { platform: 41, date: 1380000000 },
          { platform: 18, date: 1380000000 },
        ],
      }),
    ).toEqual(['Wii U', '3DS', 'NES'])
  })

  it('takes a same-day launch within one family as the original, led by its best-ranked platform', () => {
    const platforms = [
      { id: 48, name: 'PlayStation 4' },
      { id: 3, name: 'Linux' },
      { id: 6, name: 'PC (Microsoft Windows)' },
      { id: 130, name: 'Nintendo Switch' },
    ]
    const later = [
      { platform: 48, date: 1481673600 },
      { platform: 130, date: 1507161600 },
    ]
    expect(
      platformLabels({ platforms, release_dates: [{ platform: 3, date: 1456444800 }, { platform: 6, date: 1456444800 }, ...later] }),
    ).toEqual(['PC', 'PS4', 'Switch', 'Linux'])
    // Tied across families: no original.
    expect(
      platformLabels({ platforms, release_dates: [{ platform: 48, date: 1456444800 }, { platform: 6, date: 1456444800 }, { platform: 130, date: 1507161600 }] }),
    ).toEqual(['PS4', 'Switch', 'PC', 'Linux'])
  })
})

describe('releaseFields', () => {
  it('treats a full date in the past as out', () => {
    expect(
      releaseFields({
        id: 1,
        name: 'x',
        first_release_date: NOW - DAY,
        release_dates: [{ date: NOW - DAY, date_format: 0 }],
      }),
    ).toEqual({
      releaseYear: 2026,
      releaseDate: '2026-11-09',
      unreleased: false,
    })
  })

  it('treats a full date in the future as upcoming', () => {
    const first = NOW + 9 * DAY
    expect(
      releaseFields({ id: 1, name: 'x', first_release_date: first, release_dates: [{ date: first, date_format: 0 }] }),
    ).toEqual({
      releaseYear: 2026,
      releaseDate: '2026-11-19',
      unreleased: true,
    })
  })

  it('keeps a quarter or year placeholder out of releaseDate', () => {
    const q2 = Date.UTC(2027, 5, 30) / 1000
    expect(
      releaseFields({ id: 1, name: 'x', first_release_date: q2, release_dates: [{ date: q2, date_format: 4 }] }),
    ).toEqual({
      releaseYear: 2027,
      releaseDate: null,
      unreleased: true,
    })
  })

  it('treats a TBD release with no date as upcoming, and no release info as neither', () => {
    expect(releaseFields({ id: 1, name: 'x', release_dates: [{ date_format: 7 }] })).toEqual({
      releaseYear: null,
      releaseDate: null,
      unreleased: true,
    })
    expect(releaseFields({ id: 1, name: 'x' })).toEqual({ releaseYear: null, releaseDate: null, unreleased: false })
  })

  it('never tracks a cancelled game as upcoming', () => {
    expect(
      releaseFields({
        id: 1,
        name: 'x',
        game_status: 6,
        first_release_date: NOW + 30 * DAY,
        release_dates: [{ date_format: 7 }],
      }).unreleased,
    ).toBe(false)
  })
})
