import type { MediaKind, MediaType, SeriesVolume } from '../types'

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: 'Movie',
  tv: 'TV',
  book: 'Book',
  game: 'Game',
}

// "Book", or "Book series" for a series.
export function mediaLabel(media: { type: MediaType; kind?: MediaKind }): string {
  return media.kind === 'series' ? `${MEDIA_TYPE_LABELS[media.type]} series` : MEDIA_TYPE_LABELS[media.type]
}

// How a series of each type talks about its parts and progress.
export const SERIES_WORDS: Record<
  MediaType,
  { parts: string; done: string; doing: string; notStarted: string; partLabel: (volume: SeriesVolume) => string }
> = {
  // Volume titles are often just the series name and a number, sometimes not in English.
  book: { parts: 'volumes', done: 'read', doing: 'reading', notStarted: 'not started', partLabel: (v) => `Vol. ${v.position}` },
  movie: { parts: 'films', done: 'watched', doing: 'watching', notStarted: 'not watched', partLabel: (v) => v.title },
  tv: { parts: 'seasons', done: 'watched', doing: 'watching', notStarted: 'not watched', partLabel: (v) => v.title },
  game: { parts: 'games', done: 'played', doing: 'playing', notStarted: 'not played', partLabel: (v) => v.title },
}

export const FILTERABLE_MEDIA_TYPES: Array<MediaType | 'all'> = [
  'all',
  ...(Object.keys(MEDIA_TYPE_LABELS) as MediaType[]),
]

export const MEDIA_SOURCE_NAMES: Record<MediaType, string> = {
  movie: 'TMDB',
  tv: 'TMDB',
  book: 'Open Library',
  game: 'RAWG',
}
