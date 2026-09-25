export type MediaType = 'movie' | 'tv' | 'book' | 'game'
export type ListStatus = 'want' | 'done'

export interface MediaItem {
  id: string
  source: 'tmdb' | 'openlibrary' | 'rawg'
  externalId: string
  type: MediaType
  title: string
  coverImageUrl: string | null
  description: string | null
}

// Search results come straight from the providers and aren't stored, so they have no id.
export type MediaSearchResult = Pick<MediaItem, 'externalId' | 'type' | 'title' | 'coverImageUrl' | 'description'>

// How the API identifies a title to add or recommend: an existing MediaItem, or a search result.
export type MediaRef = { mediaItemId: string } | Pick<MediaItem, 'type' | 'externalId'>

export interface ListEntry {
  id: string
  userId: string
  mediaItemId: string
  status: ListStatus
  notes: string | null
  addedAt: string
  completedAt: string | null
  mediaItem: MediaItem
}

export interface Profile {
  id: string
  username: string | null
  createdAt: string
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
