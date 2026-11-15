import { env } from '../lib/env.js'
import {
  exactDate,
  joinNames,
  providerFetch,
  todayIso,
  toFacts,
  yearFromDate,
  type MediaProvider,
  toSeriesSearchResult,
  type MediaSearchResult,
  type SeriesDetails,
  type SeriesVolumeResult,
  type EpisodeResult,
  type TvShowData,
} from './types.js'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w342'
const TMDB_STILL_BASE = 'https://image.tmdb.org/t/p/w300'

interface TmdbMovieResult {
  id: number
  title: string
  overview: string | null
  poster_path: string | null
  release_date?: string
  vote_count?: number
}

interface TmdbTvResult {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
  first_air_date?: string
  vote_count?: number
}

interface TmdbNamed {
  name: string
}

interface TmdbCredits {
  cast: TmdbNamed[]
  crew: Array<TmdbNamed & { job: string }>
}

interface TmdbMovieDetail extends TmdbMovieResult {
  belongs_to_collection: { id: number; name: string } | null
  // "Released", or a stage before it ("Rumored", "Planned", "In Production", "Post Production"), or "Canceled".
  status: string | null
  tagline: string | null
  runtime: number | null
  genres: TmdbNamed[]
  vote_average: number
  credits?: TmdbCredits
}

interface TmdbTvDetail extends TmdbTvResult {
  tagline: string | null
  genres: TmdbNamed[]
  created_by: TmdbNamed[]
  networks: TmdbNamed[]
  number_of_seasons: number | null
  number_of_episodes: number | null
  episode_run_time: number[]
  status: string | null
  vote_average: number
  // The whole run's cast; plain `credits` only lists the latest season's.
  aggregate_credits?: TmdbCredits
  seasons?: TmdbSeason[]
  last_episode_to_air?: { season_number: number; episode_number: number } | null
}

interface TmdbSeason {
  season_number: number
  name: string
  episode_count: number
  air_date: string | null
  poster_path: string | null
}

interface TmdbSeasonDetail {
  episodes?: Array<{
    episode_number: number
    name: string
    overview: string | null
    air_date: string | null
    runtime: number | null
    still_path: string | null
  }>
}

interface TmdbSearchResponse<T> {
  results: T[]
}

interface TmdbCollection {
  id: number
  name: string
  overview: string | null
  poster_path: string | null
}

interface TmdbCollectionDetail extends TmdbCollection {
  parts: TmdbMovieResult[]
}

// Collection search is noisy (fan-made and one-film collections), and its results carry no
// popularity or film count, so only the best few are expanded into full series.
const COLLECTIONS_TO_EXPAND = 3

// Resolves to null on a 404 so getById can report a missing title instead of throwing.
async function tmdbFetch<T>(path: string, params: Record<string, string>): Promise<T | null> {
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', env.tmdbApiKey)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)

  const response = await providerFetch('TMDB', url, { allowNotFound: true })
  if (response.status === 404) return null
  return (await response.json()) as T
}

function toCoverUrl(posterPath: string | null): string | null {
  return posterPath ? `${TMDB_IMAGE_BASE}${posterPath}` : null
}

function formatRuntime(minutes: number | null | undefined): string | null {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

function formatRating(voteAverage: number, voteCount: number | undefined): string | null {
  return voteCount ? `${voteAverage.toFixed(1)}/10 on TMDB` : null
}

function names(people: TmdbNamed[] | undefined): string[] {
  return (people ?? []).map((person) => person.name)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

// Release fields from a date, and (from a title's full details) its production status: undated
// titles count as unreleased only when the status says they're still being made.
function releaseFields(date: string | undefined, status?: string | null, upcomingStatuses: string[] = []) {
  const releaseDate = exactDate(date)
  return {
    releaseYear: yearFromDate(date),
    releaseDate,
    unreleased: releaseDate ? releaseDate > todayIso() : !!status && upcomingStatuses.includes(status),
  }
}

const UPCOMING_MOVIE_STATUSES = ['Rumored', 'Planned', 'In Production', 'Post Production']
const UPCOMING_TV_STATUSES = ['Planned', 'In Production', 'Pilot']
const ENDED_TV_STATUSES = ['Ended', 'Canceled']

// A show's seasons and how far it has aired, as stored by refreshShow. Specials (season 0) aren't
// a season anyone works through, so they're left out.
export function toTvShowData(r: Pick<TmdbTvDetail, 'seasons' | 'last_episode_to_air' | 'status'>): TvShowData {
  const last = r.last_episode_to_air
  return {
    seasons: (r.seasons ?? [])
      .filter((season) => season.season_number > 0)
      .map((season) => ({
        number: season.season_number,
        name: season.name,
        episodeCount: season.episode_count,
        airDate: exactDate(season.air_date),
        coverImageUrl: toCoverUrl(season.poster_path),
      })),
    lastAired: last && last.season_number > 0 ? { season: last.season_number, episode: last.episode_number } : null,
    ended: !!r.status && ENDED_TV_STATUSES.includes(r.status),
  }
}

function toMovieResult(r: TmdbMovieResult): MediaSearchResult {
  return {
    externalId: String(r.id),
    type: 'movie',
    title: r.title,
    coverImageUrl: toCoverUrl(r.poster_path),
    description: r.overview,
    ...releaseFields(r.release_date),
    popularity: r.vote_count ?? 0,
  }
}

function toTvResult(r: TmdbTvResult): MediaSearchResult {
  return {
    externalId: String(r.id),
    type: 'tv',
    title: r.name,
    coverImageUrl: toCoverUrl(r.poster_path),
    description: r.overview,
    ...releaseFields(r.first_air_date),
    popularity: r.vote_count ?? 0,
  }
}

// A collection's films in release order, numbered from 1. Films with a future date are kept (and
// tracked until they're out); undated ones (like "Untitled James Bond Film") have no place in the
// order yet, so they're left out. A collection with fewer than two isn't a series worth tracking.
async function getCollection(externalId: string): Promise<SeriesDetails | null> {
  const collection = await tmdbFetch<TmdbCollectionDetail>(`/collection/${externalId}`, {})
  if (!collection?.id) return null
  const volumes = collection.parts
    .filter((part): part is TmdbMovieResult & { release_date: string } => !!exactDate(part.release_date))
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
    .map((part, index): SeriesVolumeResult => ({ ...toMovieResult(part), position: index + 1 }))
  if (volumes.length < 2) return null
  return {
    externalId,
    title: collection.name,
    description: collection.overview || null,
    coverImageUrl: toCoverUrl(collection.poster_path),
    url: `https://www.themoviedb.org/collection/${collection.id}`,
    volumes,
  }
}

// TMDB's recommendations for each title, one request per title (TMDB's rate limit is generous).
// A 404 (a title TMDB has dropped) is an empty list; a failed request leaves that title out.
async function similarFrom<T>(
  path: 'movie' | 'tv',
  externalIds: string[],
  toResult: (r: T) => MediaSearchResult,
): Promise<Map<string, MediaSearchResult[]>> {
  const settled = await Promise.allSettled(
    externalIds.map((id) => tmdbFetch<TmdbSearchResponse<T>>(`/${path}/${id}/recommendations`, {})),
  )
  const found = new Map<string, MediaSearchResult[]>()
  settled.forEach((outcome, i) => {
    if (outcome.status === 'fulfilled') found.set(externalIds[i], (outcome.value?.results ?? []).map(toResult))
  })
  if (found.size === 0 && externalIds.length > 0) {
    throw (settled.find((outcome) => outcome.status === 'rejected') as PromiseRejectedResult).reason
  }
  return found
}

export const tmdbMovieProvider: MediaProvider = {
  similar: (externalIds) => similarFrom('movie', externalIds, toMovieResult),
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/search/movie', { query })
    return (data?.results ?? []).map(toMovieResult)
  },
  async popular() {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbMovieResult>>('/trending/movie/week', {})
    return (data?.results ?? []).map(toMovieResult)
  },
  getSeries: getCollection,
  async searchSeries(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbCollection>>('/search/collection', { query })
    const expanded = await Promise.allSettled(
      (data?.results ?? []).slice(0, COLLECTIONS_TO_EXPAND).map((collection) => getCollection(String(collection.id))),
    )
    return expanded.flatMap((outcome) =>
      outcome.status === 'fulfilled' && outcome.value ? [toSeriesSearchResult(outcome.value)] : [],
    )
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbMovieDetail>(`/movie/${externalId}`, { append_to_response: 'credits' })
    if (!r?.id) return null
    const directors = r.credits?.crew.filter((member) => member.job === 'Director')
    return {
      externalId: String(r.id),
      type: 'movie',
      title: r.title,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      ...releaseFields(r.release_date, r.status, UPCOMING_MOVIE_STATUSES),
      tagline: r.tagline || null,
      genres: names(r.genres),
      facts: toFacts([
        ['Directed by', joinNames(names(directors))],
        ['Starring', joinNames(names(r.credits?.cast).slice(0, 4))],
        ['Runtime', formatRuntime(r.runtime)],
        ['Rating', formatRating(r.vote_average, r.vote_count)],
      ]),
      url: `https://www.themoviedb.org/movie/${r.id}`,
      series: r.belongs_to_collection
        ? { externalId: String(r.belongs_to_collection.id), title: r.belongs_to_collection.name }
        : undefined,
    }
  },
}

export const tmdbTvProvider: MediaProvider = {
  similar: (externalIds) => similarFrom('tv', externalIds, toTvResult),
  async search(query) {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/search/tv', { query })
    return (data?.results ?? []).map(toTvResult)
  },
  async popular() {
    const data = await tmdbFetch<TmdbSearchResponse<TmdbTvResult>>('/trending/tv/week', {})
    return (data?.results ?? []).map(toTvResult)
  },
  async getById(externalId) {
    const r = await tmdbFetch<TmdbTvDetail>(`/tv/${externalId}`, { append_to_response: 'aggregate_credits' })
    if (!r?.id) return null
    const seasons =
      r.number_of_seasons &&
      [plural(r.number_of_seasons, 'season'), r.number_of_episodes && plural(r.number_of_episodes, 'episode')]
        .filter(Boolean)
        .join(' · ')
    return {
      externalId: String(r.id),
      type: 'tv',
      title: r.name,
      coverImageUrl: toCoverUrl(r.poster_path),
      description: r.overview,
      ...releaseFields(r.first_air_date, r.status, UPCOMING_TV_STATUSES),
      tagline: r.tagline || null,
      genres: names(r.genres),
      facts: toFacts([
        ['Created by', joinNames(names(r.created_by))],
        ['Network', joinNames(names(r.networks))],
        ['Starring', joinNames(names(r.aggregate_credits?.cast).slice(0, 4))],
        ['Seasons', seasons || null],
        ['Episode length', formatRuntime(r.episode_run_time[0])],
        ['Status', r.status],
        ['Rating', formatRating(r.vote_average, r.vote_count)],
      ]),
      url: `https://www.themoviedb.org/tv/${r.id}`,
      tv: toTvShowData(r),
    }
  },
  async getSeasonEpisodes(externalId, season) {
    const r = await tmdbFetch<TmdbSeasonDetail>(`/tv/${externalId}/season/${season}`, {})
    if (!r?.episodes) return null
    return r.episodes.map(
      (episode): EpisodeResult => ({
        number: episode.episode_number,
        name: episode.name,
        overview: episode.overview || null,
        airDate: exactDate(episode.air_date),
        runtime: episode.runtime,
        stillUrl: episode.still_path ? `${TMDB_STILL_BASE}${episode.still_path}` : null,
      }),
    )
  },
}
