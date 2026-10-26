import { useCallback, useEffect, useRef, useState } from 'react'
import { resultKey } from '../hooks/usePopular'
import { friendNames } from '../lib/friends'
import { isUpcoming } from '../lib/release'
import type { FriendsPopularItem, ListStatus, MediaItem } from '../types'
import { AddToListButton } from './AddToListButton'
import { Avatar } from './Avatar'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { MediaCard } from './MediaCard'

const AVATARS_SHOWN = 3

// A row of cards for titles your friends have, each saying who, scrolled a page at a time.
// addedKeys holds resultKeys of what's on your list.
export function FriendsPopularCarousel({
  items,
  addedKeys,
  onAdd,
}: {
  items: FriendsPopularItem[]
  addedKeys: Set<string>
  onAdd: (mediaItem: MediaItem, status: ListStatus) => Promise<void>
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(false)

  const updateArrows = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    setCanPrev(track.scrollLeft > 1)
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 1)
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    updateArrows()
    const observer = new ResizeObserver(updateArrows)
    observer.observe(track)
    return () => observer.disconnect()
  }, [updateArrows, items.length])

  // Scrolls a viewful; snapping lines the next card up with the edge. Smoothness comes from the CSS.
  function page(direction: 1 | -1) {
    const track = trackRef.current
    track?.scrollBy({ left: direction * track.clientWidth })
  }

  return (
    <div className="carousel">
      <div className="carousel-track" ref={trackRef} onScroll={updateArrows}>
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
                  added={addedKeys.has(resultKey(mediaItem))}
                  onAdd={(status) => onAdd(mediaItem, status)}
                  upcoming={isUpcoming(mediaItem)}
                />
              </>
            }
          />
        ))}
      </div>
      {canPrev && (
        <button className="carousel-arrow carousel-arrow--prev btn-icon" aria-label="Previous" onClick={() => page(-1)}>
          <ChevronLeftIcon />
        </button>
      )}
      {canNext && (
        <button className="carousel-arrow carousel-arrow--next btn-icon" aria-label="Next" onClick={() => page(1)}>
          <ChevronRightIcon />
        </button>
      )}
    </div>
  )
}
