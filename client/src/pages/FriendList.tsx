import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { LoadingState } from '../components/Spinner'
import { api } from '../lib/api'
import type { ListEntry } from '../types'

export function FriendList() {
  const { id } = useParams<{ id: string }>()
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .get<ListEntry[]>(`/api/friends/${id}/list`)
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div>
      <Link to="/friends" className="back-link">
        ← Friends
      </Link>
      <PageHeader title="Their backlog" />

      {loading && <LoadingState />}
      {!loading && entries.length === 0 && (
        <EmptyState>
          <p>Their list is empty for now.</p>
        </EmptyState>
      )}

      <div className="media-grid">
        {entries.map((entry) => (
          <MediaCard
            key={entry.id}
            mediaItem={entry.mediaItem}
            actions={
              <span className={`status-badge status-badge--${entry.status}`}>
                {entry.status === 'done' ? 'Done' : 'Up next'}
              </span>
            }
          />
        ))}
      </div>
    </div>
  )
}
