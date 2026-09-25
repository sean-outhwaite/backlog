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
