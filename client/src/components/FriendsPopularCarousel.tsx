import { resultKey } from '../hooks/usePopular'
import { friendNames } from '../lib/friends'
import { isUpcoming } from '../lib/release'
import type { FriendsPopularItem, ListStatus, MediaItem } from '../types'
import { AddToListButton } from './AddToListButton'
import { Avatar } from './Avatar'
import { Carousel } from './Carousel'
import { MediaCard } from './MediaCard'

const AVATARS_SHOWN = 3

// A row of cards for titles your friends have, each saying who.
// listed holds the status of what's on your list, by resultKey.
export function FriendsPopularCarousel({
  items,
  listed,
  onAdd,
}: {
  items: FriendsPopularItem[]
  listed: ReadonlyMap<string, ListStatus>
  onAdd: (mediaItem: MediaItem, status: ListStatus) => Promise<void>
}) {
  return (
    <Carousel>
      {items.map(({ mediaItem, friends }) => (
        <MediaCard
          key={mediaItem.id}
          mediaItem={mediaItem}
          recommend={{ mediaItemId: mediaItem.id }}
          actions={
            <>
              <p className="friends-have">
                <span className="avatar-stack" aria-hidden="true">
                  {friends.slice(0, AVATARS_SHOWN).map((friend) => (
                    <Avatar key={friend.id} profile={friend} size="sm" />
                  ))}
                </span>
                <span>
                  <strong>{friendNames(friends)}</strong> added this
                </span>
              </p>
              <AddToListButton
                added={listed.get(resultKey(mediaItem)) ?? false}
                onAdd={(status) => onAdd(mediaItem, status)}
                upcoming={isUpcoming(mediaItem)}
              />
            </>
          }
        />
      ))}
    </Carousel>
  )
}
