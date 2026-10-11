import { useEffect, useState } from 'react'
import { Link, NavLink, useParams } from 'react-router-dom'
import { AddToListButton } from '../components/AddToListButton'
import { CollectionCard } from '../components/CollectionCard'
import { Avatar } from '../components/Avatar'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { StatusTabs } from '../components/StatusTabs'
import { useStatusParam } from '../hooks/useStatusParam'
import { api } from '../lib/api'
import type { CollectionSummary, ListEntry, ListStatus, Profile } from '../types'

const EMPTY_MESSAGES: Record<ListStatus, string> = {
  want: 'Nothing in their backlog right now.',
  in_progress: 'Nothing on the go right now.',
  done: "They haven't finished anything yet.",
}

export function FriendList() {
  const { id } = useParams<{ id: string }>()
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [friend, setFriend] = useState<Pick<Profile, 'username' | 'avatarUrl'> | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useStatusParam()
  // Media item ids already on your own list, so their cards show as added.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<{ friend: Pick<Profile, 'id' | 'username' | 'avatarUrl'> | null; entries: ListEntry[] }>(
        `/api/friends/${id}/list`,
      )
      .then((list) => {
        setFriend(list.friend)
        setEntries(list.entries)
      })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    api
      .get<ListEntry[]>('/api/lists')
      .then((own) => setAddedIds((prev) => new Set([...prev, ...own.map((entry) => entry.mediaItemId)])))
      .catch(() => {})
  }, [])

  async function addToList(mediaItemId: string) {
    await api.post('/api/lists', { mediaItemId })
    setAddedIds((prev) => new Set(prev).add(mediaItemId))
  }

  const countFor = (s: ListStatus) => entries.filter((entry) => entry.status === s).length
  const visible = entries.filter((entry) => entry.status === status)

  return (
    <div>
      <FriendHeader id={id!} friend={friend} view="backlog" />

      <div className="list-toolbar">
        <StatusTabs status={status} onChange={setStatus} countFor={countFor} />
      </div>

      {loading && <LoadingState />}
      {!loading && visible.length === 0 && (
        <EmptyState>
          <p>{EMPTY_MESSAGES[status]}</p>
        </EmptyState>
      )}

      <div className="media-grid">
        {visible.map((entry) => (
          <MediaCard
            key={entry.id}
            mediaItem={entry.mediaItem}
            progress={entry.progress}
            stackCovers={entry.covers}
            actions={
              <AddToListButton
                added={addedIds.has(entry.mediaItemId)}
                onAdd={() => addToList(entry.mediaItemId)}
                label={entry.mediaItem.kind === 'series' ? 'Add series' : undefined}
              />
            }
          />
        ))}
      </div>
    </div>
  )
}

type FriendProfile = Pick<Profile, 'id' | 'username' | 'avatarUrl'>

// Shared by a friend's backlog and lists: who they are, and tabs between the two.
function FriendHeader({
  id,
  friend,
  view,
}: {
  id: string
  friend: Pick<Profile, 'username' | 'avatarUrl'> | null
  view: 'backlog' | 'lists'
}) {
  const name = friend?.username ? `${friend.username}'s` : 'Their'
  return (
    <>
      <Link to="/friends" className="back-link">
        ← Friends
      </Link>
      <PageHeader
        title={
          <span className="friend-heading">
            {friend && <Avatar profile={friend} size="lg" />}
            {name} {view}
          </span>
        }
      />
      <nav className="view-tabs" aria-label="Their backlog or lists">
        <NavLink to={`/friends/${id}`} end>
          Backlog
        </NavLink>
        <NavLink to={`/friends/${id}/lists`}>Lists</NavLink>
      </nav>
    </>
  )
}

export function FriendCollections() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = useState<{ friend: FriendProfile | null; collections: CollectionSummary[] } | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    api
      .get<{ friend: FriendProfile | null; collections: CollectionSummary[] }>(`/api/friends/${id}/collections`)
      .then((found) => !cancelled && setData(found))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <div>
      <FriendHeader id={id!} friend={data?.friend ?? null} view="lists" />
      {failed && <p className="error-text">Couldn't load their lists.</p>}
      {!data && !failed && <LoadingState />}
      {data?.collections.length === 0 && (
        <EmptyState>
          <p>No lists yet.</p>
        </EmptyState>
      )}
      <div className="media-grid">
        {data?.collections.map((collection) => (
          <CollectionCard key={collection.id} collection={collection} />
        ))}
      </div>
    </div>
  )
}
