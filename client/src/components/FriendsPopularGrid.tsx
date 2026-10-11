import { resultKey } from '../hooks/usePopular'
import { friendNames } from '../lib/friends'
import { isUpcoming } from '../lib/release'
import type { FriendsPopularItem, ListStatus, MediaItem } from '../types'
import { AddToListButton } from './AddToListButton'
import { Avatar } from './Avatar'
import { MediaCard } from './MediaCard'
import { RecommendControl } from './RecommendControl'

const AVATARS_SHOWN = 3

// Cards for titles your friends have, each saying who. addedKeys holds resultKeys of what's on your list.
export function FriendsPopularGrid({
  items,
  addedKeys,
  onAdd,
}: {
  items: FriendsPopularItem[]
  addedKeys: Set<string>
  onAdd: (mediaItem: MediaItem, status: ListStatus) => Promise<void>
}) {
  return (
    <div className="media-grid">
      {items.map(({ mediaItem, friends }) => (
        <MediaCard
          key={mediaItem.id}
          mediaItem={mediaItem}
          actions={
            <>
              <p className="friends-have">
                <span className="avatar-stack" aria-hidden="true">
                  {friends.slice(0, AVATARS_SHOWN).map((friend) => (
                    <Avatar key={friend.id} profile={friend} size="sm" />
                  ))}
                </span>
                <span>
                  <strong>{friendNames(friends)}</strong> {friends.length === 1 ? 'has' : 'have'} this
                </span>
              </p>
              <AddToListButton
                added={addedKeys.has(resultKey(mediaItem))}
                onAdd={(status) => onAdd(mediaItem, status)}
                upcoming={isUpcoming(mediaItem)}
              />
              <RecommendControl media={{ mediaItemId: mediaItem.id }} title={mediaItem.title} />
            </>
          }
        />
      ))}
    </div>
  )
}
