import type { MediaSource, MediaType } from '@prisma/client'
import { openLibraryProvider } from './openlibrary.js'
import { rawgProvider } from './rawg.js'
import { tmdbMovieProvider, tmdbTvProvider } from './tmdb.js'
import type { MediaProvider } from './types.js'

export const providersByType: Record<MediaType, MediaProvider> = {
  movie: tmdbMovieProvider,
  tv: tmdbTvProvider,
  book: openLibraryProvider,
  game: rawgProvider,
}

export const allMediaTypes: MediaType[] = ['movie', 'tv', 'book', 'game']

export const sourceByType: Record<MediaType, MediaSource> = {
  movie: 'tmdb',
  tv: 'tmdb',
  book: 'openlibrary',
  game: 'rawg',
}
