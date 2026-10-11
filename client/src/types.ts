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
  // Release tracking, as stored: see isUpcoming in lib/release for what they mean together.
  releaseDate: string | null
  releasePending: boolean
  releaseCheckedAt: string | null
}

// Search results come straight from the providers and aren't stored, so they have no id.
// `series` is set when a title belongs to a series that can be added whole.
export type MediaSearchResult = Pick<
  MediaItem,
  'externalId' | 'type' | 'title' | 'coverImageUrl' | 'description' | 'releaseYear' | 'releaseDate'
> & {
  // Straight from the provider: not out yet.
  unreleased?: boolean
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
  // Null shows the username's initial instead.
  avatarUrl: string | null
  createdAt: string
}

export interface InvitePreview {
  owner: Pick<Profile, 'id' | 'username' | 'avatarUrl'>
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

export type NotificationType = 'recommendation' | 'released'

// Who did it (a recommendation's sender) and what it's about; either can be gone by the time it's read.
export interface AppNotification {
  id: string
  type: NotificationType
  createdAt: string
  readAt: string | null
  actor: Pick<Profile, 'id' | 'username' | 'avatarUrl'> | null
  mediaItem: MediaItem | null
}

export interface UnreadCounts {
  total: number
  recommendation: number
  released: number
}

// A title on friends' lists but not yours, with the friends who have it (see GET /api/media/popular/friends).
export interface FriendsPopularItem {
  mediaItem: MediaItem
  friends: Pick<Profile, 'id' | 'username' | 'avatarUrl'>[]
}

export type CollectionKind = 'custom' | 'picks'

// A named list friends can browse ("Lists" in the UI); picks is each user's one list of
// recommendations for every friend.
export interface Collection {
  id: string
  ownerId: string
  kind: CollectionKind
  name: string
  description: string | null
  createdAt: string
}

// As listed: the newest few covers instead of the items. `contains` only when asked about a title.
export interface CollectionSummary extends Collection {
  itemCount: number
  covers: string[]
  contains?: boolean
}

export interface CollectionItem {
  collectionId: string
  mediaItemId: string
  note: string | null
  addedAt: string
  mediaItem: MediaItem
}

export interface CollectionDetail extends Collection {
  owner: Pick<Profile, 'id' | 'username' | 'avatarUrl'>
  isOwn: boolean
  items: CollectionItem[]
}

// A title from friends' picks, with everyone who picked it, newest first.
export interface FriendsPick {
  mediaItem: MediaItem
  pickedBy: { friend: Pick<Profile, 'id' | 'username' | 'avatarUrl'>; note: string | null; addedAt: string }[]
}
