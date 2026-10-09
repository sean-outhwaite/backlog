import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AddToListButton } from '../components/AddToListButton'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { StatusTabs } from '../components/StatusTabs'
import { useStatusParam } from '../hooks/useStatusParam'
import { api } from '../lib/api'
import type { ListEntry, ListStatus } from '../types'

const EMPTY_MESSAGES: Record<ListStatus, string> = {
  want: 'Nothing in their backlog right now.',
  in_progress: 'Nothing on the go right now.',
  done: "They haven't finished anything yet.",
}

export function FriendList() {
  const { id } = useParams<{ id: string }>()
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [username, setUsername] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useStatusParam()
  // Media item ids already on your own list, so their cards show as added.
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<{ friend: { username: string | null } | null; entries: ListEntry[] }>(`/api/friends/${id}/list`)
      .then((list) => {
        setUsername(list.friend?.username ?? null)
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
      <Link to="/friends" className="back-link">
        ← Friends
      </Link>
      <PageHeader title={username ? `${username}'s backlog` : 'Their backlog'} />

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
