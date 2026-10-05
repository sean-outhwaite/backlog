import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
import { EntryMenu } from '../components/EntryMenu'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { SeriesVolumes } from '../components/SeriesVolumes'
import { LoadingState } from '../components/Spinner'
import { UndoToast } from '../components/UndoToast'
import { CheckIcon, LogoMark, MediaTypeIcon, PlayIcon, UndoIcon } from '../components/icons'
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

// How long a removal can be undone before it's sent to the server.
const UNDO_MS = 5000

// Keyed by the status an action moves the entry to.
const ACTION_ICONS: Record<ListStatus, ComponentType> = {
  in_progress: PlayIcon,
  done: CheckIcon,
  want: UndoIcon,
}

export function Dashboard() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<ListEntry[]>([])
  // The tab lives in the URL so it survives a reload and other views can link to a tab.
  const [searchParams, setSearchParams] = useSearchParams()
  const status = STATUS_TABS.find((tab) => tab.status === searchParams.get('status'))?.status ?? 'want'
  const setStatus = (next: ListStatus) => setSearchParams(next === 'want' ? {} : { status: next }, { replace: true })
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

  // Drops the entry between its new visible neighbours. Entries hidden by the tab or type filter
  // keep their positions, so the order of what's shown is all that changes.
  async function moveEntry(activeId: string, overId: string) {
    const from = visible.findIndex((e) => e.id === activeId)
    const to = visible.findIndex((e) => e.id === overId)
    if (from < 0 || to < 0 || from === to) return
    const moved = arrayMove(visible, from, to)
    const before = moved[to - 1]
    const after = moved[to + 1]
    const position = before && after ? (before.position + after.position) / 2 : before ? before.position + 1 : after.position - 1

    const byPosition = (a: ListEntry, b: ListEntry) => a.position - b.position
    setEntries((prev) => prev.map((e) => (e.id === activeId ? { ...e, position } : e)).sort(byPosition))
    try {
      await api.patch<ListEntry>(`/api/lists/${activeId}`, { position })
    } catch {
      load()
    }
  }

  // Removing hides the entry straight away but holds off deleting it, so Undo can bring it back with
  // its position and series progress intact. Only one removal is pending at a time: starting another,
  // or leaving the page, sends the pending one now.
  const [removing, setRemoving] = useState<ListEntry | null>(null)
  const pendingRemoval = useRef<{ timer: number; commit: () => void } | null>(null)

  function flushRemoval() {
    const pending = pendingRemoval.current
    if (!pending) return
    window.clearTimeout(pending.timer)
    pending.commit()
  }

  useEffect(() => flushRemoval, [])

  function removeEntry(entry: ListEntry) {
    flushRemoval()
    const commit = () => {
      pendingRemoval.current = null
      setRemoving((current) => (current?.id === entry.id ? null : current))
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
      // If the delete fails, reloading puts the entry back.
      api.delete(`/api/lists/${entry.id}`).catch(load)
    }
    pendingRemoval.current = { timer: window.setTimeout(commit, UNDO_MS), commit }
    setRemoving(entry)
  }

  function undoRemoval() {
    if (pendingRemoval.current) window.clearTimeout(pendingRemoval.current.timer)
    pendingRemoval.current = null
    setRemoving(null)
  }

  const listed = entries.filter((entry) => entry.id !== removing?.id)
  const countFor = (s: ListStatus) => listed.filter((entry) => entry.status === s).length
  const visible = listed.filter(
    (entry) => entry.status === status && (typeFilter === 'all' || entry.mediaItem.type === typeFilter),
  )

  return (
    <div>
      <PageHeader
        title={profile?.username ? `${profile.username}'s backlog` : 'My backlog'}
        subtitle="Everything you've been meaning to watch, read and play."
      />

      <div className="list-toolbar">
        <StatusTabs status={status} onChange={setStatus} countFor={countFor} />
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

      <SortableGrid ids={visible.map((entry) => entry.id)} onMove={(from, to) => void moveEntry(from, to)}>
        {visible.map((entry) => (
          <SortableEntry key={entry.id} id={entry.id}>
            <MediaCard
              mediaItem={entry.mediaItem}
              progress={entry.progress}
              stackCovers={entry.covers}
              onSeriesAdded={load}
              details={entry.mediaItem.kind === 'series' && <SeriesVolumes entry={entry} onChanged={load} />}
              // Start sits over the cover; the other tabs' main moves stay in the card body.
              coverMain={
                entry.status === 'want' && (
                  <MainMoveButton entry={entry} onMove={(to) => void updateStatus(entry, to)} />
                )
              }
              coverActions={
                <>
                  <MoveShortcuts entry={entry} onMove={(to) => void updateStatus(entry, to)} />
                  <EntryMenu onRemove={() => void removeEntry(entry)} />
                </>
              }
              actions={
                <>
                  {entry.status !== 'want' && (
                    <MainMoveButton entry={entry} onMove={(to) => void updateStatus(entry, to)} />
                  )}
                  <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} />
                </>
              }
            />
          </SortableEntry>
        ))}
      </SortableGrid>

      {removing && (
        <UndoToast
          key={removing.id}
          message={`Removed ${removing.mediaItem.title}`}
          duration={UNDO_MS}
          onUndo={undoRemoval}
        />
      )}
    </div>
  )
}

// Cards are dragged by the whole card. A mouse drag starts after a few pixels so clicks still
// work, and a touch one after a long press so the page still scrolls. From the keyboard, a focused
// card is picked up with space and moved with the arrow keys.
function SortableGrid({
  ids,
  onMove,
  children,
}: {
  ids: string[]
  onMove: (activeId: string, overId: string) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  // The card is still under the pointer when it's dropped, so the release would otherwise land as a
  // click on it and open its details.
  const justDropped = useRef(false)
  const dropped = () => {
    justDropped.current = true
    setTimeout(() => (justDropped.current = false))
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    dropped()
    if (over && active.id !== over.id) onMove(String(active.id), String(over.id))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragCancel={dropped}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div
          className="media-grid"
          onClickCapture={(event) => {
            if (!justDropped.current) return
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          {children}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableEntry({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    attributes: { role: 'group', roleDescription: 'sortable card' },
  })
  // The details dialog is portalled out of the card, but React still bubbles its events through
  // here, so a press inside it mustn't pick the card up.
  const { onKeyDown, ...pressListeners } = listeners ?? {}
  const pointerListeners = Object.fromEntries(
    Object.entries(pressListeners).map(([name, handler]) => [
      name,
      (event: SyntheticEvent) => {
        if (event.currentTarget.contains(event.target as Node)) handler(event)
      },
    ]),
  )
  return (
    <div
      ref={setNodeRef}
      className={`sortable-entry${isDragging ? ' is-dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...pointerListeners}
      // Only when the card itself has focus: space or enter on one of its buttons is that button's.
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onKeyDown?.(event)
      }}
    >
      {children}
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
        className={`btn-icon cover-action cover-action--${action.to}`}
        onClick={() => onMove(action.to)}
        aria-label={action.label}
        title={action.label}
      >
        <ShortcutIcon />
      </button>
    )
  })
}

// The accent underline is one element that slides to whichever tab is active, measured from the
// DOM since the tabs are content-width. It re-measures on resize too, as counts arrive and the
// active tab's bolder label change widths.
function StatusTabs({
  status,
  onChange,
  countFor,
}: {
  status: ListStatus
  onChange: (status: ListStatus) => void
  countFor: (status: ListStatus) => number
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Partial<Record<ListStatus, HTMLButtonElement | null>>>({})
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const tab = tabRefs.current[status]
      if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [status])

  return (
    <div className="status-tabs" ref={containerRef}>
      {STATUS_TABS.map((tab) => (
        <button
          key={tab.status}
          ref={(el) => {
            tabRefs.current[tab.status] = el
          }}
          className={status === tab.status ? 'active' : ''}
          aria-pressed={status === tab.status}
          onClick={() => onChange(tab.status)}
        >
          {tab.label}
          <span className="status-count">{countFor(tab.status)}</span>
        </button>
      ))}
      {indicator && (
        <span
          className="status-indicator"
          aria-hidden="true"
          style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
        />
      )}
    </div>
  )
}
