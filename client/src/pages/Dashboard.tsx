import { useEffect, useState } from 'react'
import { MediaCard } from '../components/MediaCard'
import { RecommendControl } from '../components/RecommendControl'
import { api } from '../lib/api'
import type { ListEntry, ListStatus, MediaType } from '../types'

const MEDIA_TYPES: Array<MediaType | 'all'> = ['all', 'movie', 'tv', 'book', 'game']

export function Dashboard() {
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [status, setStatus] = useState<ListStatus>('want')
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [loading, setLoading] = useState(true)

  function load() {
    api
      .get<ListEntry[]>('/api/lists')
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function updateStatus(entry: ListEntry, nextStatus: ListStatus) {
    const updated = await api.patch<ListEntry>(`/api/lists/${entry.id}`, { status: nextStatus })
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
  }

  async function removeEntry(entry: ListEntry) {
    await api.delete(`/api/lists/${entry.id}`)
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
  }

  const visible = entries.filter(
    (entry) => entry.status === status && (typeFilter === 'all' || entry.mediaItem.type === typeFilter),
  )

  return (
    <div>
      <div className="page-toolbar">
        <div className="tabs">
          <button className={status === 'want' ? 'active' : ''} onClick={() => setStatus('want')}>
            Want to consume
          </button>
          <button className={status === 'done' ? 'active' : ''} onClick={() => setStatus('done')}>
            Done
          </button>
        </div>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as MediaType | 'all')}>
          {MEDIA_TYPES.map((type) => (
            <option key={type} value={type}>
              {type === 'all' ? 'All types' : type}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="page-status">Loading…</p>}
      {!loading && visible.length === 0 && <p className="page-status">Nothing here yet.</p>}

      <div className="media-grid">
        {visible.map((entry) => (
          <MediaCard
            key={entry.id}
            mediaItem={entry.mediaItem}
            actions={
              <>
                <button onClick={() => void updateStatus(entry, entry.status === 'want' ? 'done' : 'want')}>
                  {entry.status === 'want' ? 'Mark done' : 'Move back to want'}
                </button>
                <button onClick={() => void removeEntry(entry)}>Remove</button>
                <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}
