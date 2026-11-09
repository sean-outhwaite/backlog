import { env } from '../lib/env.js'
import {
  joinNames,
  providerFetch,
  ProviderError,
  todayIso,
  toFacts,
  type MediaDetails,
  type MediaProvider,
  type MediaSearchResult,
} from './types.js'

// IGDB (Twitch's games database). Every call is a POST of an Apicalypse query, authorised with a
// Twitch app token. Its rate limit (4 requests/s, 8 open) is per client id across every Vercel
// instance, so each search or lookup is kept to one request by expanding related fields inline.
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'

// Main games, expansions, remakes, remasters, expanded editions and ports. Leaves out
// DLC, bundles, mods, episodes, seasons, updates and packs. Ports stay in because IGDB files some
// originals as ports (Castlevania III is the NES port of a Famicom game); a minor port has few or
// no ratings, so rankSearchResults puts it below the original. version_parent = null drops
// editions ("Ultimate Edition"). Handheld Electronic LCD (411) is excluded as a platform.
const GAME_FILTER = 'version_parent = null & game_type = (0,2,4,8,9,10,11) & platforms != (411)'

// Cancelled games never come out, so they're never tracked as upcoming.
const STATUS_CANCELLED = 6
// release_dates.date_format: 0 is a full date; 1-6 are a month, year or quarter; 7 is TBD.
const DATE_FORMAT_EXACT = 0
const DATE_FORMAT_TBD = 7

// IGDB's counts run about a tenth of TMDB vote_count for comparable hits (Elden Ring ~2.3k ratings,
// a hit film 20-30k votes), so they're scaled up to rank fairly against films, TV and books.
const POPULARITY_SCALE = 10

const SUMMARY_FIELDS =
  'name,cover.image_id,first_release_date,release_dates.date,release_dates.date_format,game_status,total_rating_count,hypes,platforms.name,platforms.abbreviation,release_dates.platform'
const DETAIL_FIELDS = [
  SUMMARY_FIELDS,
  'summary,url,genres.name,aggregated_rating',
  'involved_companies.company.name,involved_companies.developer,involved_companies.publisher',
  'age_ratings.organization.name,age_ratings.rating_category.rating',
].join(',')

interface IgdbReleaseDate {
  date?: number
  date_format?: number
  // The platform's id.
  platform?: number
}

export interface IgdbGame {
  id: number
  name: string
  cover?: { image_id: string }
  // Unix seconds, midnight UTC. A placeholder (end of the year or quarter) when only that's known.
  first_release_date?: number
  release_dates?: IgdbReleaseDate[]
  game_status?: number
  total_rating_count?: number
  hypes?: number
  summary?: string
  url?: string
  genres?: Array<{ name: string }>
  platforms?: Array<{ id: number; name: string; abbreviation?: string }>
  aggregated_rating?: number
  involved_companies?: Array<{ company: { name: string }; developer: boolean; publisher: boolean }>
  age_ratings?: Array<{ organization?: { name: string }; rating_category?: { rating: string } }>
}

// The app token lasts about two months; it's fetched when first needed and kept per instance.
let token: { value: string; expiresAt: number } | null = null
let pendingToken: Promise<string> | null = null
const TOKEN_REFRESH_MARGIN_MS = 24 * 60 * 60 * 1000

async function fetchToken(): Promise<string> {
  const url = new URL(TWITCH_TOKEN_URL)
  url.searchParams.set('client_id', env.twitchClientId)
  url.searchParams.set('client_secret', env.twitchClientSecret)
  url.searchParams.set('grant_type', 'client_credentials')
  const response = await providerFetch('Twitch', url, { method: 'POST' })
  const body = (await response.json()) as { access_token: string; expires_in: number }
  token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 }
  return token.value
}

function getToken(): Promise<string> {
  if (token && token.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return Promise.resolve(token.value)
  // Concurrent first calls share one token request.
  pendingToken ??= fetchToken().finally(() => {
    pendingToken = null
  })
  return pendingToken
}

// Only for tests: forget the cached token.
export function resetIgdbToken() {
  token = null
  pendingToken = null
}

async function igdbQuery(query: string): Promise<IgdbGame[]> {
  const send = async () =>
    providerFetch('IGDB', IGDB_GAMES_URL, {
      method: 'POST',
      headers: { 'Client-ID': env.twitchClientId, Authorization: `Bearer ${await getToken()}` },
      body: query,
    })
  let response
  try {
    response = await send()
  } catch (error) {
    // A token revoked or expired early: get a new one and try once more.
    if (!(error instanceof ProviderError && error.status === 401)) throw error
    token = null
    response = await send()
  }
  return (await response.json()) as IgdbGame[]
}

function coverUrl(game: IgdbGame): string | null {
  return game.cover?.image_id
    ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${game.cover.image_id}.jpg`
    : null
}

export function releaseFields(game: IgdbGame) {
  const first = game.first_release_date
  const date = first === undefined ? null : new Date(first * 1000).toISOString().slice(0, 10)
  // first_release_date is a placeholder unless a release on that day gives the full date.
  const exact =
    first !== undefined && !!game.release_dates?.some((r) => r.date === first && r.date_format === DATE_FORMAT_EXACT)
  const cancelled = game.game_status === STATUS_CANCELLED
  return {
    releaseYear: date ? Number(date.slice(0, 4)) : null,
    releaseDate: exact ? date : null,
    unreleased:
      !cancelled && (date ? date > todayIso() : !!game.release_dates?.some((r) => r.date_format === DATE_FORMAT_TBD)),
  }
}

// Short labels for search cards, keyed by IGDB platform name, newest first within each family.
// Mac and Linux count as PC, so a PC game with Mac and Linux ports leads with just "PC".
const PLATFORM_LABELS: Array<[name: string, label: string, family: string]> = [
  ['PlayStation 5', 'PS5', 'PlayStation'],
  ['PlayStation 4', 'PS4', 'PlayStation'],
  ['PlayStation 3', 'PS3', 'PlayStation'],
  ['PlayStation Vita', 'Vita', 'PlayStation'],
  ['PlayStation 2', 'PS2', 'PlayStation'],
  ['PlayStation Portable', 'PSP', 'PlayStation'],
  ['PlayStation', 'PS1', 'PlayStation'],
  ['Xbox Series X|S', 'Xbox Series', 'Xbox'],
  ['Xbox One', 'Xbox One', 'Xbox'],
  ['Xbox 360', 'Xbox 360', 'Xbox'],
  ['Xbox', 'Xbox', 'Xbox'],
  ['Nintendo Switch 2', 'Switch 2', 'Nintendo'],
  ['Nintendo Switch', 'Switch', 'Nintendo'],
  ['Wii U', 'Wii U', 'Nintendo'],
  ['Nintendo 3DS', '3DS', 'Nintendo'],
  ['New Nintendo 3DS', 'New 3DS', 'Nintendo'],
  ['Wii', 'Wii', 'Nintendo'],
  ['Nintendo DS', 'DS', 'Nintendo'],
  ['Nintendo DSi', 'DSi', 'Nintendo'],
  ['Nintendo GameCube', 'GameCube', 'Nintendo'],
  ['Game Boy Advance', 'GBA', 'Nintendo'],
  ['Nintendo 64', 'N64', 'Nintendo'],
  ['Game Boy Color', 'GBC', 'Nintendo'],
  ['Super Nintendo Entertainment System', 'SNES', 'Nintendo'],
  ['Super Famicom', 'Super Famicom', 'Nintendo'],
  ['Game Boy', 'Game Boy', 'Nintendo'],
  ['Nintendo Entertainment System', 'NES', 'Nintendo'],
  ['Family Computer', 'Famicom', 'Nintendo'],
  ['Family Computer Disk System', 'Famicom Disk', 'Nintendo'],
  ['PC (Microsoft Windows)', 'PC', 'PC'],
  ['Mac', 'Mac', 'PC'],
  ['Linux', 'Linux', 'PC'],
  ['DOS', 'DOS', 'PC'],
  ['iOS', 'iOS', 'Mobile'],
  ['Android', 'Android', 'Mobile'],
  ['Sega Mega Drive/Genesis', 'Genesis', 'Sega'],
  ['Sega Saturn', 'Saturn', 'Sega'],
  ['Dreamcast', 'Dreamcast', 'Sega'],
]
const PLATFORM_BY_NAME = new Map(PLATFORM_LABELS.map(([name, label, family], rank) => [name, { label, family, rank }]))

interface PlatformLabel {
  label: string
  family: string
  rank: number
}

function labelFor(platform: { name: string; abbreviation?: string }): PlatformLabel {
  const entry = PLATFORM_BY_NAME.get(platform.name)
  if (entry) return entry
  // Unknown platforms rank after every known one, in IGDB's order, each its own family.
  const label = platform.abbreviation && platform.abbreviation.length <= 8 ? platform.abbreviation : platform.name
  return { label, family: platform.name, rank: Infinity }
}

// The platform a game first came out on, where it came out there before anywhere else (Castlevania
// III on the NES, not its Wii U re-release). Platforms tied for first count when they're one
// family (Windows and Linux on the same day), and the best-ranked of them leads. None for a
// launch across families, or when every platform came out the same day.
function originalPlatform(
  game: Pick<IgdbGame, 'release_dates'>,
  labels: Map<number, PlatformLabel>,
): PlatformLabel | null {
  const earliest = new Map<number, number>()
  for (const { platform, date } of game.release_dates ?? []) {
    if (platform === undefined || date === undefined || !labels.has(platform)) continue
    earliest.set(platform, Math.min(date, earliest.get(platform) ?? Infinity))
  }
  const first = Math.min(...earliest.values())
  const firsts = [...earliest].filter(([, date]) => date === first).map(([id]) => labels.get(id)!)
  if (firsts.length === earliest.size || new Set(firsts.map((l) => l.family)).size > 1) return null
  return firsts.sort((a, b) => a.rank - b.rank)[0]
}

// Short labels for a game's platforms, most telling first: the original platform where there's a
// clear one (so a retro game's NES isn't buried under re-releases), then the newest platform from
// each family (PS5, Xbox Series, Switch, PC), then the rest. Unknown platforms come last, as their
// abbreviation where that's short ("Arcade", "C64") or else their name.
export function platformLabels(game: Pick<IgdbGame, 'platforms' | 'release_dates'>): string[] {
  const labels = new Map((game.platforms ?? []).map((platform) => [platform.id, labelFor(platform)]))
  const original = originalPlatform(game, labels)
  // A stable sort keeps unknown platforms (all ranked Infinity) in IGDB's order.
  const sorted = [...labels.values()].filter((l) => l !== original).sort((a, b) => a.rank - b.rank)
  const seenFamilies = new Set<string>()
  const leads = []
  const rest = []
  for (const entry of sorted) {
    if (entry.rank === Infinity || seenFamilies.has(entry.family)) rest.push(entry.label)
    else {
      seenFamilies.add(entry.family)
      leads.push(entry.label)
    }
  }
  return [...new Set([...(original ? [original.label] : []), ...leads, ...rest])]
}

export function toSearchResult(game: IgdbGame): MediaSearchResult {
  return {
    externalId: String(game.id),
    type: 'game',
    title: game.name,
    coverImageUrl: coverUrl(game),
    description: null,
    ...releaseFields(game),
    platforms: platformLabels(game),
    // Hype (people following an unreleased game) keeps upcoming games from ranking as unknowns.
    popularity: ((game.total_rating_count ?? 0) + (game.hypes ?? 0)) * POPULARITY_SCALE,
  }
}

// ESRB and PEGI, where rated: "M (ESRB), 16 (PEGI)".
function ageRating(game: IgdbGame): string | null {
  const ratings = ['ESRB', 'PEGI'].flatMap((organization) => {
    const found = game.age_ratings?.find((r) => r.organization?.name === organization)
    return found?.rating_category ? [`${found.rating_category.rating} (${organization})`] : []
  })
  return ratings.length ? ratings.join(', ') : null
}

export function toDetails(game: IgdbGame): MediaDetails {
  const companies = game.involved_companies ?? []
  return {
    externalId: String(game.id),
    type: 'game',
    title: game.name,
    coverImageUrl: coverUrl(game),
    description: game.summary ?? null,
    ...releaseFields(game),
    tagline: null,
    genres: game.genres?.map((genre) => genre.name) ?? [],
    facts: toFacts([
      [
        'Platforms',
        joinNames(
          game.platforms?.map((p) => p.name),
          10,
        ),
      ],
      ['Developer', joinNames(companies.filter((c) => c.developer).map((c) => c.company.name))],
      ['Publisher', joinNames(companies.filter((c) => c.publisher).map((c) => c.company.name))],
      ['Critic score', game.aggregated_rating ? String(Math.round(game.aggregated_rating)) : null],
      ['Age rating', ageRating(game)],
    ]),
    url: game.url ?? 'https://www.igdb.com',
  }
}

// Apicalypse strings are double-quoted; drop quotes and backslashes rather than escape them.
function searchText(query: string): string {
  return query.replace(/["\\]/g, ' ').trim()
}

export const igdbProvider: MediaProvider = {
  // Results come back by relevance (IGDB refuses sort with search); rankSearchResults reorders.
  async search(query) {
    const text = searchText(query)
    if (!text) return []
    const games = await igdbQuery(`search "${text}"; fields ${SUMMARY_FIELDS}; where ${GAME_FILTER}; limit 20;`)
    return games.map(toSearchResult)
  },
  // The most-rated games released in the past year.
  async popular() {
    const now = Math.floor(Date.now() / 1000)
    const yearAgo = now - 365 * 24 * 60 * 60
    const games = await igdbQuery(
      `fields ${SUMMARY_FIELDS}; where ${GAME_FILTER} & first_release_date > ${yearAgo} & first_release_date <= ${now} & total_rating_count != null; sort total_rating_count desc; limit 20;`,
    )
    return games.map(toSearchResult)
  },
  async getById(externalId) {
    if (!/^\d+$/.test(externalId)) return null
    const [game] = await igdbQuery(`fields ${DETAIL_FIELDS}; where id = ${externalId};`)
    return game ? toDetails(game) : null
  },
}
