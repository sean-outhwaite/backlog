import { useEffect, useState, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { LoadingState } from '../components/Spinner'
import { CheckIcon, LogoMark, MediaTypeIcon, PlayIcon, TrashIcon, UndoIcon } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { api } from '../lib/api'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import type { ListEntry, ListStatus, MediaType } from '../types'

const STATUS_TABS: { status: ListStatus; label: string }[] = [
  { status: 'want', label: 'Backlog' },
  { status: 'in_progress', label: 'In progress' },
  { status: 'done', label: 'Done' },
]

// The moves offered on each tab's cards; the first is the primary action.
// iconOnly drops the visible label (it stays as the accessible name) where the icon says it all.
const STATUS_ACTIONS: Record<ListStatus, { to: ListStatus; label: string; iconOnly?: boolean }[]> = {
  want: [
    { to: 'in_progress', label: 'Start', iconOnly: true },
    { to: 'done', label: 'Finished' },
  ],
  in_progress: [
    { to: 'done', label: 'Finished' },
    { to: 'want', label: 'Move to backlog' },
  ],
  done: [{ to: 'want', label: 'Move to backlog' }],
}

// Keyed by the status an action moves the entry to.
const ACTION_ICONS: Record<ListStatus, ComponentType> = {
  in_progress: PlayIcon,
  done: CheckIcon,
  want: UndoIcon,
}

export function Dashboard() {
  const { profile } = useAuth()
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
    const updated = await api.patch<ListEntry>(`/api/lists/${entry.id}`, {
      status: nextStatus,
    })
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
  }

  async function removeEntry(entry: ListEntry) {
    await api.delete(`/api/lists/${entry.id}`)
    setEntries((prev) => prev.filter((e) => e.id !== entry.id))
  }

  const countFor = (s: ListStatus) => entries.filter((entry) => entry.status === s).length
  const visible = entries.filter(
    (entry) => entry.status === status && (typeFilter === 'all' || entry.mediaItem.type === typeFilter),
  )

  return (
    <div>
      <PageHeader
        title={profile?.username ? `${profile.username}'s backlog` : 'My backlog'}
        subtitle="Everything you've been meaning to watch, read and play."
      />

      <div className="list-toolbar">
        <div className="status-tabs">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.status}
              className={status === tab.status ? 'active' : ''}
              aria-pressed={status === tab.status}
              onClick={() => setStatus(tab.status)}
            >
              {tab.label}
              <span className="status-count">{countFor(tab.status)}</span>
            </button>
          ))}
        </div>
        <div className="type-filter" role="group" aria-label="Filter by type">
          {FILTERABLE_MEDIA_TYPES.map((type) => {
            const label = type === 'all' ? 'All types' : MEDIA_TYPE_LABELS[type]
            return (
              <button
                key={type}
                className={typeFilter === type ? 'active' : ''}
                aria-pressed={typeFilter === type}
                aria-label={label}
                title={label}
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? <span className="type-filter-all">All</span> : <MediaTypeIcon type={type} />}
              </button>
            )
          })}
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && visible.length === 0 && (
        <EmptyState icon={<LogoMark />}>
          {status === 'want' && (
            <p>
              Your backlog is empty. <Link to="/search">Find something to add</Link>.
            </p>
          )}
          {status === 'in_progress' && <p>Nothing on the go. Start something from up next and it'll show up here.</p>}
          {status === 'done' && <p>Nothing finished yet. Mark something done and it'll show up here.</p>}
        </EmptyState>
      )}

      <div className="media-grid">
        {visible.map((entry) => (
          <MediaCard
            key={entry.id}
            mediaItem={entry.mediaItem}
            coverActions={
              STATUS_ACTIONS[entry.status].length > 1 && (
                <MoveShortcuts entry={entry} onMove={(to) => void updateStatus(entry, to)} />
              )
            }
            actions={
              <>
                <MainMoveButton entry={entry} onMove={(to) => void updateStatus(entry, to)} />
                <button
                  className="btn-quiet btn-danger media-card-remove"
                  onClick={() => void removeEntry(entry)}
                  aria-label="Remove from list"
                  title="Remove from list"
                >
                  <TrashIcon />
                </button>
                <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} />
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}

// The first move is the card's labelled button (primary, unless the entry is already done).
function MainMoveButton({ entry, onMove }: { entry: ListEntry; onMove: (to: ListStatus) => void }) {
  const main = STATUS_ACTIONS[entry.status][0]
  const MainIcon = ACTION_ICONS[main.to]
  const classes = ['entry-move', entry.status !== 'done' && 'btn-primary', main.iconOnly && 'entry-move--icon-only']
  return (
    <button
      className={classes.filter(Boolean).join(' ')}
      onClick={() => onMove(main.to)}
      aria-label={main.iconOnly ? main.label : undefined}
      title={main.iconOnly ? main.label : undefined}
    >
      {/* A tick beside "Finished" is noise; it only earns its place as a shortcut. */}
      {main.to !== 'done' && <MainIcon />}
      {!main.iconOnly && main.label}
    </button>
  )
}

// Any further moves become icon shortcuts on the cover.
function MoveShortcuts({ entry, onMove }: { entry: ListEntry; onMove: (to: ListStatus) => void }) {
  return STATUS_ACTIONS[entry.status].slice(1).map((action) => {
    const ShortcutIcon = ACTION_ICONS[action.to]
    return (
      <button
        key={action.to}
        className="btn-icon cover-action"
        onClick={() => onMove(action.to)}
        aria-label={action.label}
        title={action.label}
      >
        <ShortcutIcon />
      </button>
    )
  })
}
