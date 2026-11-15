export type MediaType = 'movie' | 'tv' | 'book' | 'game'
export type ListStatus = 'want' | 'in_progress' | 'done'
// A series (e.g. a manga run) is a MediaItem of its own, whose volumes are ordinary titles.
export type MediaKind = 'title' | 'series'

export type MediaSource = 'tmdb' | 'openlibrary' | 'igdb'

export interface MediaItem {
  id: string
  source: MediaSource
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
  // A game's short platform labels, most relevant first ("PS5", "Xbox Series", "PC").
  platforms?: string[]
  series?: SeriesRef
  // Set on results that are a whole series rather than a single title.
  kind?: 'series'
  volumeCount?: number
  covers?: string[]
}

// A title like ones on your list, for Recommendations' "For you" row: because holds the titles
// of yours it's like, most telling first.
export type ForYouResult = MediaSearchResult & { because: string[] }

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
  screenshots?: Screenshot[]
}

export interface Screenshot {
  thumbnailUrl: string
  url: string
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
  // When it was started and finished; null when that isn't known.
  startedAt: string | null
  completedAt: string | null
  // Ascending order of the user's list.
  position: number
  mediaItem: MediaItem
  // TV shows only: how it's tracked (see TvSeasons). Null for every other type.
  tracking?: TrackingMode | null
  // Series entries: how many of the series' volumes are done. TV shows tracked by season or episode:
  // seasons or aired episodes watched, and what's next.
  progress?: EntryProgress
  // Series entries only: the first few volumes' covers, stacked up on the card.
  covers?: string[]
}

export type TrackingMode = 'show' | 'season' | 'episode'

export interface EntryProgress {
  done: number
  total: number
  unit?: 'season' | 'episode'
  // Where the user is up to; null once caught up.
  next?: { season: number; episode?: number } | null
}

// One season of a TV show entry, with the user's progress through it.
export interface TvSeason {
  number: number
  name: string
  episodeCount: number
  airDate: string | null
  coverImageUrl: string | null
  // Premiered; and how many of its episodes have aired so far.
  out: boolean
  airedEpisodes: number
  status: ListStatus
  // Episode numbers watched, tracking by episode. A done season counts as all of them.
  episodes: number[]
}

export interface TvSeasons {
  tracking: TrackingMode | null
  seasons: TvSeason[]
}

// One episode of a season, fetched live from TMDB.
export interface Episode {
  number: number
  name: string
  overview: string | null
  airDate: string | null
  runtime: number | null
  stillUrl: string | null
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

export type NotificationType = 'recommendation' | 'released' | 'new_season'

// Who did it (a recommendation's sender) and what it's about; either can be gone by the time it's read.
export interface AppNotification {
  id: string
  type: NotificationType
  createdAt: string
  readAt: string | null
  actor: Pick<Profile, 'id' | 'username' | 'avatarUrl'> | null
  mediaItem: MediaItem | null
  // new_season only.
  season: number | null
}

// A page of GET /api/notifications. nextCursor is passed back as ?cursor= for the next one.
export interface NotificationPage {
  notifications: AppNotification[]
  nextCursor: string | null
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
