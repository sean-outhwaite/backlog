import type { MediaKind, MediaSource, MediaType, SeriesVolume } from '../types'

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: 'Movie',
  tv: 'TV',
  book: 'Book',
  game: 'Game',
}

// What starting a title means, filling out its Start button ("Start reading").
export const START_VERBS: Record<MediaType, string> = {
  movie: 'watching',
  tv: 'watching',
  book: 'reading',
  game: 'playing',
}

// "Book", or "Book series" for a series.
export function mediaLabel(media: { type: MediaType; kind?: MediaKind }): string {
  return media.kind === 'series' ? `${MEDIA_TYPE_LABELS[media.type]} series` : MEDIA_TYPE_LABELS[media.type]
}

// How a series of each type talks about its parts and progress.
export const SERIES_WORDS: Record<
  MediaType,
  { parts: string; part: string; done: string; doing: string; notStarted: string; partLabel: (volume: SeriesVolume) => string }
> = {
  // Volume titles are often just the series name and a number, sometimes not in English.
  book: { parts: 'volumes', part: 'Vol.', done: 'read', doing: 'reading', notStarted: 'not started', partLabel: (v) => `Vol. ${v.position}` },
  movie: { parts: 'films', part: 'Film', done: 'watched', doing: 'watching', notStarted: 'not watched', partLabel: (v) => v.title },
  tv: { parts: 'seasons', part: 'Season', done: 'watched', doing: 'watching', notStarted: 'not watched', partLabel: (v) => v.title },
  game: { parts: 'games', part: 'Game', done: 'played', doing: 'playing', notStarted: 'not played', partLabel: (v) => v.title },
}

export const FILTERABLE_MEDIA_TYPES: Array<MediaType | 'all'> = [
  'all',
  ...(Object.keys(MEDIA_TYPE_LABELS) as MediaType[]),
]

export const MEDIA_SOURCE_NAMES: Record<MediaSource, string> = {
  tmdb: 'TMDB',
  openlibrary: 'Open Library',
  rawg: 'RAWG',
  igdb: 'IGDB',
}

// Where each type's titles come from now (mirrors sourceByType on the server).
export const SOURCE_BY_TYPE: Record<MediaType, MediaSource> = {
  movie: 'tmdb',
  tv: 'tmdb',
  book: 'openlibrary',
  game: 'igdb',
}

// A stored title from a source its type has moved off (a RAWG game): it has no live details, and
// its externalId means nothing to (or another title on) the type's current provider.
export function isRetiredSource(media: { type: MediaType; source?: MediaSource }): boolean {
  return !!media.source && media.source !== SOURCE_BY_TYPE[media.type]
}
