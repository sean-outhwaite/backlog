import { resultKey } from '../hooks/usePopular'
import type { FriendsPopularItem, MediaItem } from '../types'
import { AddToListButton } from './AddToListButton'
import { Avatar } from './Avatar'
import { MediaCard } from './MediaCard'
import { RecommendControl } from './RecommendControl'

const AVATARS_SHOWN = 3

// "Mazuko", "Mazuko and nick", "Mazuko, nick and 2 others".
function friendNames(friends: FriendsPopularItem['friends']) {
  const names = friends.map((friend) => friend.username ?? 'a friend')
  if (names.length <= 2) return names.join(' and ')
  const others = names.length - 2
  return `${names[0]}, ${names[1]} and ${others} ${others === 1 ? 'other' : 'others'}`
}

// Cards for titles your friends have, each saying who. addedKeys holds resultKeys of what's on your list.
export function FriendsPopularGrid({
  items,
  addedKeys,
  onAdd,
}: {
  items: FriendsPopularItem[]
  addedKeys: Set<string>
  onAdd: (mediaItem: MediaItem) => Promise<void>
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
              <AddToListButton added={addedKeys.has(resultKey(mediaItem))} onAdd={() => onAdd(mediaItem)} />
              <RecommendControl media={{ mediaItemId: mediaItem.id }} title={mediaItem.title} />
            </>
          }
        />
      ))}
    </div>
  )
}
