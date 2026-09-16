import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
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

  if (loading) return <p className="page-status">Loading…</p>

  return (
    <div>
      <h2>Their list</h2>
      <div className="media-grid">
        {entries.map((entry) => (
          <MediaCard key={entry.id} mediaItem={entry.mediaItem} actions={<span>{entry.status}</span>} />
        ))}
      </div>
    </div>
  )
}
