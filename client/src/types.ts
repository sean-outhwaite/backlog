export type MediaType = 'movie' | 'tv' | 'book' | 'game'
export type ListStatus = 'want' | 'in_progress' | 'done'
// A series (e.g. a manga run) is a MediaItem of its own, whose volumes are ordinary titles.
export type MediaKind = 'title' | 'series'

export interface MediaItem {
  id: string
  source: 'tmdb' | 'openlibrary' | 'rawg'
  externalId: string
  type: MediaType
  kind: MediaKind
  title: string
  coverImageUrl: string | null
  description: string | null
  releaseYear: number | null
}

// Search results come straight from the providers and aren't stored, so they have no id.
// `series` is set when a title belongs to a series that can be added whole.
export type MediaSearchResult = Pick<
  MediaItem,
  'externalId' | 'type' | 'title' | 'coverImageUrl' | 'description' | 'releaseYear'
> & {
  series?: SeriesRef
  // Set on results that are a whole series rather than a single title.
  kind?: 'series'
  volumeCount?: number
  covers?: string[]
}

export interface SeriesRef {
  externalId: string
  title: string
}

// Live details for one title, fetched from its provider when its details view opens; never stored.
export interface MediaFact {
  label: string
  value: string
}

export interface MediaDetails extends MediaSearchResult {
  tagline: string | null
  genres: string[]
  facts: MediaFact[]
  url: string
  series?: SeriesRef
}

// How the API identifies a title to add or recommend: an existing MediaItem, or a search result.
export type MediaRef = { mediaItemId: string } | (Pick<MediaItem, 'type' | 'externalId'> & { kind?: MediaKind })

export interface ListEntry {
  id: string
  userId: string
  mediaItemId: string
  status: ListStatus
  notes: string | null
  addedAt: string
  completedAt: string | null
  // Ascending order of the user's list.
  position: number
  mediaItem: MediaItem
  // Series entries only: how many of the series' volumes are done.
  progress?: { done: number; total: number }
  // Series entries only: the first few volumes' covers, stacked up on the card.
  covers?: string[]
}

// One volume of a series entry, with the user's status for it.
export interface SeriesVolume extends MediaItem {
  position: number
  status: ListStatus
}

export interface Profile {
  id: string
  username: string | null
  createdAt: string
}

export interface InvitePreview {
  owner: Pick<Profile, 'id' | 'username'>
  isOwn: boolean
  alreadyFriends: boolean
}

export interface InviteLink {
  id: string
  ownerId: string
  token: string
  createdAt: string
}

export interface Recommendation {
  id: string
  fromUserId: string
  toUserId: string
  mediaItemId: string
  message: string | null
  createdAt: string
  viewedAt: string | null
  fromUser: Profile
  mediaItem: MediaItem
}
