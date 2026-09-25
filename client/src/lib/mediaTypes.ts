import type { MediaType } from '../types'

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  movie: 'Movie',
  tv: 'TV',
  book: 'Book',
  game: 'Game',
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
