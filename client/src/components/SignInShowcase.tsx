import type { ListTab } from '../hooks/useStatusParam'
import type { AppNotification, MediaItem } from '../types'
import { MediaCard } from './MediaCard'
import { NotificationItem } from './NotificationItem'
import { StatusTabs } from './StatusTabs'
import { MediaTypeIcon, SendIcon, SeriesIcon } from './icons'

// A look at the signed-in app for first-time visitors, beside the sign-in form. It's built from the
// app's own components with sample data rather than screenshots, so it follows the current design
// and the light/dark theme. Covers are real ones hotlinked from the providers' CDNs. The preview is
// inert: nothing in it can be clicked or focused, since none of it is wired to an account.

function sample(
  id: string,
  type: MediaItem['type'],
  title: string,
  releaseYear: number,
  coverImageUrl: string,
  kind: MediaItem['kind'] = 'title',
): MediaItem {
  return {
    id,
    source: type === 'game' ? 'igdb' : type === 'book' ? 'openlibrary' : 'tmdb',
    externalId: id,
    type,
    kind,
    title,
    coverImageUrl,
    description: null,
    releaseYear,
    releaseDate: null,
    releasePending: false,
    releaseCheckedAt: null,
  }
}

const SAUL = sample(
  'sample-saul',
  'tv',
  'Better Call Saul',
  2015,
  'https://image.tmdb.org/t/p/w342/fC2HDm5t0kHl7mTm7jxMR31b7by.jpg',
)
const DISCWORLD = sample(
  'sample-discworld',
  'book',
  'Discworld',
  1983,
  'https://covers.openlibrary.org/b/id/14647238-L.jpg',
  'series',
)
const OUTER_WILDS = sample(
  'sample-outer-wilds',
  'game',
  'Outer Wilds',
  2019,
  'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co65ac.jpg',
)
const DISCO = sample(
  'sample-disco',
  'game',
  'Disco Elysium',
  2019,
  'https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1sfj.jpg',
)
const DUNGEON = sample(
  'sample-dungeon',
  'tv',
  'Delicious in Dungeon',
  2024,
  'https://image.tmdb.org/t/p/w342/9t3DYdGxK3i4WRzKvIZwJd4kBnr.jpg',
)

const TAB_COUNTS: Record<ListTab, number> = { want: 24, in_progress: 3, done: 41, upcoming: 0 }

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString()
}

const NOTIFICATIONS: AppNotification[] = [
  {
    id: 'sample-rec',
    type: 'recommendation',
    createdAt: hoursAgo(2),
    readAt: null,
    actor: { id: 'sample-maya', username: 'maya', avatarUrl: null },
    mediaItem: DISCO,
    season: null,
  },
  {
    id: 'sample-season',
    type: 'new_season',
    createdAt: hoursAgo(26),
    readAt: null,
    actor: null,
    mediaItem: DUNGEON,
    season: 2,
  },
]

const FEATURES = [
  {
    icon: <MediaTypeIcon type="movie" />,
    title: 'Movies, TV, books and games',
    text: 'One list for everything you mean to get to.',
  },
  {
    icon: <SeriesIcon />,
    title: 'Series and seasons',
    text: 'Track progress, and hear when the next one is out.',
  },
  {
    icon: <SendIcon />,
    title: 'Recommendations from friends',
    text: 'Send friends titles and see what they’re into.',
  },
]

// Two pieces for AuthShell's grid: the preview, and the feature list, which sits under the sign-in
// card on wide screens (so the two columns come out about the same height) and last on narrow ones.
export function SignInShowcase() {
  return (
    <>
      <figure className="showcase">
        <figcaption className="showcase-caption">A look inside</figcaption>
        <div className="showcase-window" inert>
          <div className="showcase-chrome" aria-hidden="true">
            <span />
            <span />
            <span />
            <span className="showcase-url">backlog.outh.nz</span>
          </div>
          <div className="showcase-body">
            <div className="showcase-tabs">
              <StatusTabs status="in_progress" onChange={() => {}} countFor={(tab) => TAB_COUNTS[tab]} />
            </div>
            <div className="media-grid showcase-grid">
              <MediaCard mediaItem={SAUL} progress={{ done: 4, total: 6 }} />
              <MediaCard mediaItem={DISCWORLD} progress={{ done: 12, total: 41 }} partCount={41} />
              <MediaCard mediaItem={OUTER_WILDS} platforms={['PS5', 'Switch', 'PC']} />
            </div>
            <div className="showcase-notifications">
              {NOTIFICATIONS.map((notification) => (
                <NotificationItem key={notification.id} notification={notification} />
              ))}
            </div>
          </div>
        </div>
      </figure>
      <ul className="showcase-features">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <span className="showcase-feature-icon" aria-hidden="true">
              {feature.icon}
            </span>
            <span>
              <strong>{feature.title}</strong>
              {feature.text}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
