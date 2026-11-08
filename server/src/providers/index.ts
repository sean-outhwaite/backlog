import type { MediaSource, MediaType } from '@prisma/client'
import { igdbProvider } from './igdb.js'
import { openLibraryProvider } from './openlibrary.js'
import { tmdbMovieProvider, tmdbTvProvider } from './tmdb.js'
import type { MediaProvider } from './types.js'

// Where each type's titles come from now: search, popular and new MediaItems.
export const providersByType: Record<MediaType, MediaProvider> = {
  movie: tmdbMovieProvider,
  tv: tmdbTvProvider,
  book: openLibraryProvider,
  game: igdbProvider,
}

export const allMediaTypes: MediaType[] = ['movie', 'tv', 'book', 'game']

export const sourceByType: Record<MediaType, MediaSource> = {
  movie: 'tmdb',
  tv: 'tmdb',
  book: 'openlibrary',
  game: 'igdb',
}

// Every source a type is still fetched from, for queries over stored rows.
export const activeSources: MediaSource[] = [...new Set(Object.values(sourceByType))]

// The provider for a stored row. Null for a source its type has moved off (as games moved from
// RAWG to IGDB): such rows show from what's stored and are never fetched again, since their ids
// mean nothing to the type's current provider, or would mean a different title. No stored rows
// are like that now; keep looking stored rows up through this if a provider is ever swapped.
export function providerFor(source: MediaSource, type: MediaType): MediaProvider | null {
  return sourceByType[type] === source ? providersByType[type] : null
}
