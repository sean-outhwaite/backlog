import { useEffect, useRef, useState } from 'react'
import { AddToListButton } from '../components/AddToListButton'
import { FriendsPopularCarousel } from '../components/FriendsPopularCarousel'
import { Avatar } from '../components/Avatar'
import { MediaCard } from '../components/MediaCard'
import { EntryMenu } from '../components/EntryMenu'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { CloseIcon } from '../components/icons'
import { useNotifications } from '../hooks/useNotifications'
import { listedKeys, resultKey, useFriendsPopular, usePopular } from '../hooks/usePopular'
import { api } from '../lib/api'
import { friendNames } from '../lib/friends'
import { isUpcoming } from '../lib/release'
import type { FriendsPick, ListEntry, ListStatus, MediaItem, MediaSearchResult, Recommendation } from '../types'

// How long a dismissal can be undone before it's sent to the server.
const UNDO_MS = 5000

export function Recommendations() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  // What friends have put on their picks lists: recommendations to everyone, rather than to you.
  const [picks, setPicks] = useState<FriendsPick[]>([])
  // A recommendation is pending until its title is on your list. Decided once on load, so
  // adding one here doesn't make popular titles pop in underneath mid-visit.
  const [hasPending, setHasPending] = useState(true)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const generalPopular = usePopular('all', !loading && !hasPending)
  const friendsPopular = useFriendsPopular('all', !loading && !hasPending)
  // Friends' titles first; the general list leaves out any already shown there.
  const friendsKeys = new Set(friendsPopular?.map((item) => resultKey(item.mediaItem)))
  const popular = generalPopular && generalPopular.filter((result) => !friendsKeys.has(resultKey(result)))
  const { markRead } = useNotifications()

  // Dismissing hides the recommendation straight away but holds off deleting it, so Undo can bring
  // it back. One at a time, as on the backlog: dismissing another, or leaving, sends the pending one now.
  const [dismissing, setDismissing] = useState<Recommendation | null>(null)
  const pendingDismissal = useRef<{ timer: number; commit: () => void } | null>(null)

  function flushDismissal() {
    const pending = pendingDismissal.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pending.commit()
  }

  useEffect(() => flushDismissal, [])

  function dismiss(rec: Recommendation) {
    flushDismissal()
    const commit = () => {
      pendingDismissal.current = null
      setDismissing((current) => (current?.id === rec.id ? null : current))
      setRecommendations((prev) => prev.filter((r) => r.id !== rec.id))
      // If the delete fails, the recommendation is still there on the next visit.
      api.delete(`/api/recommendations/${rec.id}`).catch(() => {})
    }
    pendingDismissal.current = { timer: window.setTimeout(commit, UNDO_MS), commit }
    setDismissing(rec)
  }

  function undoDismissal() {
    if (pendingDismissal.current) window.clearTimeout(pendingDismissal.current.timer)
    pendingDismissal.current = null
    setDismissing(null)
  }

  const shownRecommendations = recommendations.filter((rec) => rec.id !== dismissing?.id)

  useEffect(() => {
    async function load() {
      const loaded = await Promise.all([
        api.get<Recommendation[]>('/api/recommendations'),
        // Your own list only marks what's already on it, so the page goes on without it.
        api.get<ListEntry[]>('/api/lists').catch(() => []),
        api.get<FriendsPick[]>('/api/collections/feed').catch(() => []),
      ]).catch(() => null)
      if (!loaded) {
        setFailed(true)
        setLoading(false)
        return
      }
      const [found, entries, friendsPicks] = loaded
      setPicks(friendsPicks)
      const onList = new Set(entries.map((entry) => entry.mediaItemId))
      setRecommendations(found)
      // Recommendations are keyed by mediaItemId and popular titles by resultKey; both start from your list.
      setAddedIds((prev) => new Set([...prev, ...onList, ...listedKeys(entries)]))
      setHasPending(found.some((rec) => !onList.has(rec.mediaItemId)))
      setLoading(false)
      await markRead('recommendation')
    }
    void load()
  }, [markRead])

  async function addToList(mediaItemId: string, status: ListStatus) {
    await api.post('/api/lists', { mediaItemId, status })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  async function addFriendsPick(mediaItem: MediaItem, status: ListStatus) {
    await api.post('/api/lists', { mediaItemId: mediaItem.id, status })
    setAddedIds((prev) => new Set(prev).add(resultKey(mediaItem)))
  }

  async function addPopularToList(result: MediaSearchResult, status: ListStatus) {
    await api.post('/api/lists', { type: result.type, externalId: result.externalId, status })
    setAddedIds((prev) => new Set(prev).add(resultKey(result)))
  }

  // Shown in place of the empty state, or under the recommendations once none are pending. With
  // friends' titles too, each part gets a heading.
  const generalGrid = !!popular?.length && (
    <div className="media-grid">
      {popular.map((result) => (
        <MediaCard
          key={resultKey(result)}
          mediaItem={result}
          recommend={{ type: result.type, externalId: result.externalId }}
          actions={
            <>
              <AddToListButton
                added={addedIds.has(resultKey(result))}
                onAdd={(status) => addPopularToList(result, status)}
                upcoming={isUpcoming(result)}
              />
            </>
          }
        />
      ))}
    </div>
  )
  const popularGrid = friendsPopular?.length ? (
    <>
      <section className="popular-section">
        <h2>Popular with your friends</h2>
        <FriendsPopularCarousel items={friendsPopular} addedKeys={addedIds} onAdd={addFriendsPick} />
      </section>
      {generalGrid && (
        <section className="popular-section">
          <h2>Popular right now</h2>
          {generalGrid}
        </section>
      )}
    </>
  ) : (
    generalGrid
  )

  return (
    <div>
      <PageHeader title="Recommendations" subtitle="Things your friends think you'd love." />

      {loading && <LoadingState />}
      {failed && <p className="error-text">Couldn't load your recommendations. Reload to try again.</p>}
      {!loading && !failed && shownRecommendations.length === 0 && picks.length === 0 && (
        <EmptyState className={popularGrid ? 'empty-state--popular' : undefined}>
          {popularGrid ? (
            <>
              <p>No recommendations from friends yet, but check out these popular titles.</p>
              {popularGrid}
            </>
          ) : (
            <p>No recommendations yet. When a friend sends you something, it'll land here.</p>
          )}
        </EmptyState>
      )}

      <div className="media-grid">
        {shownRecommendations.map((rec) => (
          <MediaCard
            key={rec.id}
            mediaItem={rec.mediaItem}
            coverActions={
              <EntryMenu
                onRemove={() => dismiss(rec)}
                label="Dismiss"
                icon={<CloseIcon />}
                triggerLabel={`More actions for ${rec.mediaItem.title}`}
              />
            }
            actions={
              <>
                <p className="recommendation-from">
                  <Avatar profile={rec.fromUser} size="sm" />
                  From <strong>{rec.fromUser.username}</strong>
                </p>
                {rec.message && <p className="recommendation-message">“{rec.message}”</p>}
                <AddToListButton
                  added={addedIds.has(rec.mediaItemId)}
                  onAdd={(status) => addToList(rec.mediaItemId, status)}
                  upcoming={isUpcoming(rec.mediaItem)}
                />
              </>
            }
          />
        ))}
      </div>

      {picks.length > 0 && (
        <section className="popular-section picks-section">
          <h2>Friends' picks</h2>
          <div className="media-grid">
            {picks.map(({ mediaItem, pickedBy }) => {
              const note = pickedBy.find((pick) => pick.note)
              return (
                <MediaCard
                  key={mediaItem.id}
                  mediaItem={mediaItem}
                  actions={
                    <>
                      <p className="friends-have">
                        <span className="avatar-stack" aria-hidden="true">
                          {pickedBy.slice(0, 3).map(({ friend }) => (
                            <Avatar key={friend.id} profile={friend} size="sm" />
                          ))}
                        </span>
                        <span>
                          <strong>{friendNames(pickedBy.map((pick) => pick.friend))}</strong> picked this
                        </span>
                      </p>
                      {note && (
                        <p className="recommendation-message">
                          “{note.note}”
                          {pickedBy.length > 1 && <span className="note-by"> — {note.friend.username}</span>}
                        </p>
                      )}
                      <AddToListButton
                        added={addedIds.has(mediaItem.id)}
                        onAdd={(status) => addToList(mediaItem.id, status)}
                        upcoming={isUpcoming(mediaItem)}
                      />
                    </>
                  }
                />
              )
            })}
          </div>
        </section>
      )}

      {(shownRecommendations.length > 0 || picks.length > 0) && popularGrid && (
        <EmptyState className="empty-state--popular">
          <p>You're all caught up on recommendations. Here's what's trending right now.</p>
          {popularGrid}
        </EmptyState>
      )}
      {dismissing && (
        <Toast
          key={dismissing.id}
          message={`Dismissed ${dismissing.mediaItem.title}`}
          duration={UNDO_MS}
          action={{ label: 'Undo', onClick: undoDismissal }}
        />
      )}
    </div>
  )
}
