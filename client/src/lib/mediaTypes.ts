import type { MediaKind, MediaType } from '../types'

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
