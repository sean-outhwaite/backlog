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
import { Link } from 'react-router-dom'
import { MediaCard } from '../components/MediaCard'
import { EntryMenu } from '../components/EntryMenu'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { RecommendControl } from '../components/RecommendControl'
import { SeriesVolumes } from '../components/SeriesVolumes'
import { StatusTabs } from '../components/StatusTabs'
import { LoadingState } from '../components/Spinner'
import { Toast } from '../components/Toast'
import { CheckIcon, LogoMark, MediaTypeIcon, PlayIcon, TrashIcon, UndoIcon } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { useStatusParam, type ListTab } from '../hooks/useStatusParam'
import { api } from '../lib/api'
import { FILTERABLE_MEDIA_TYPES, MEDIA_TYPE_LABELS, START_VERBS } from '../lib/mediaTypes'
import { byReleaseDate, entryTab } from '../lib/release'
import type { ListEntry, ListStatus, MediaType } from '../types'

// The moves offered on each tab's cards; the first is the primary action. Start is worded and drawn
// for the title's type (moveFace).
const STATUS_ACTIONS: Record<ListStatus, { to: ListStatus; label: string }[]> = {
  want: [
    { to: 'in_progress', label: 'Start' },
    { to: 'done', label: 'Finished' },
  ],
  in_progress: [
    { to: 'done', label: 'Finished' },
    { to: 'want', label: 'Move to backlog' },
  ],
  done: [{ to: 'in_progress', label: 'Resume' }],
}

// How long a removal can be undone before it's sent to the server.
const UNDO_MS = 5000

// Keyed by the status an action moves the entry to.
const ACTION_ICONS: Record<ListStatus, ComponentType> = {
  in_progress: PlayIcon,
  done: CheckIcon,
  want: UndoIcon,
}

// How a move's button reads: Start says what you'd be starting ("Start" + "reading") beside the
// type's icon, since a bare play icon reads as playing a preview.
function moveFace(entry: ListEntry, action: { to: ListStatus; label: string }) {
  if (entry.status === 'want' && action.to === 'in_progress') {
    const { type } = entry.mediaItem
    return { label: action.label, more: START_VERBS[type], icon: <MediaTypeIcon type={type} /> }
  }
  const ActionIcon = ACTION_ICONS[action.to]
  return { label: action.label, more: undefined, icon: <ActionIcon /> }
}

export function Dashboard() {
  const { profile } = useAuth()
  const [entries, setEntries] = useState<ListEntry[]>([])
  const [status, setStatus] = useStatusParam()
  const [typeFilter, setTypeFilter] = useState<MediaType | 'all'>('all')
  const [loading, setLoading] = useState(true)

  function load() {
    api
      .get<ListEntry[]>('/api/lists')
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  // Drops the entry between its new visible neighbours. Entries hidden by the tab or type filter
  // keep their positions, so the order of what's shown is all that changes.
  async function moveEntry(activeId: string, overId: string) {
    const from = visible.findIndex((e) => e.id === activeId)
    const to = visible.findIndex((e) => e.id === overId)
    if (from < 0 || to < 0 || from === to) return
    const moved = arrayMove(visible, from, to)
    const before = moved[to - 1]
    const after = moved[to + 1]
    const position =
      before && after ? (before.position + after.position) / 2 : before ? before.position + 1 : after.position - 1

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
    dismissMoved()
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

  // Moving an entry to another tab saves straight away, then offers Undo for as long as a removal
  // would, which puts the entry back as it was. One toast at a time: moving sends any pending
  // removal now, and removing dismisses this.
  const [moved, setMoved] = useState<{ entry: ListEntry; to: ListStatus } | null>(null)
  const movedTimer = useRef<number | undefined>(undefined)

  function dismissMoved() {
    window.clearTimeout(movedTimer.current)
    setMoved(null)
  }

  useEffect(() => () => window.clearTimeout(movedTimer.current), [])

  // When a card leaves its tab (or comes back on undo), the cards after it glide to their new
  // places rather than jumping: where they were is noted just before the list changes, and once
  // it's rendered each is animated from there. Only for these, so dragging is left to dnd-kit.
  const slideFrom = useRef<Map<string, DOMRect> | null>(null)
  useLayoutEffect(() => {
    const from = slideFrom.current
    if (!from) return
    slideFrom.current = null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    for (const card of document.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const was = from.get(card.dataset.entryId!)
      if (!was) continue
      const now = card.getBoundingClientRect()
      const dx = was.left - now.left
      const dy = was.top - now.top
      if (!dx && !dy) continue
      card.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 500,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      })
    }
  })

  // The card eases out while the move saves (unless it's already gone: Finished pops it first), then
  // leaves, the cards after it glide in, and the toast offers Undo. If the save fails it eases back.
  async function moveTo(entry: ListEntry, to: ListStatus, { easeOut = true } = {}) {
    const card = document.querySelector<HTMLElement>(`[data-entry-id="${entry.id}"] > .media-card`)
    const exit =
      easeOut && card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? card.animate(CARD_EXIT, { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' })
        : null
    const [updated] = await Promise.all([
      api.patch<ListEntry>(`/api/lists/${entry.id}`, { status: to }),
      exit?.finished,
    ]).catch((error: unknown) => {
      exit?.cancel()
      throw error
    })
    slideFrom.current = cardRects()
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
    flushRemoval()
    window.clearTimeout(movedTimer.current)
    setMoved({ entry, to })
    movedTimer.current = window.setTimeout(() => setMoved(null), UNDO_MS)
  }

  function undoMove() {
    if (!moved) return
    const { entry } = moved
    dismissMoved()
    slideFrom.current = cardRects()
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
    api
      .patch<ListEntry>(`/api/lists/${entry.id}`, { status: entry.status })
      .then((updated) => setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e))))
      // If it fails, reloading shows where the entry really is.
      .catch(load)
  }

  function undoRemoval() {
    if (pendingRemoval.current) window.clearTimeout(pendingRemoval.current.timer)
    pendingRemoval.current = null
    setRemoving(null)
  }

  const listed = entries.filter((entry) => entry.id !== removing?.id)
  const countFor = (tab: ListTab) => listed.filter((entry) => entryTab(entry) === tab).length
  const visible = listed.filter(
    (entry) => entryTab(entry) === status && (typeFilter === 'all' || entry.mediaItem.type === typeFilter),
  )
  // Upcoming titles can't be started or finished, and wait in release order rather than your own.
  const upcoming = status === 'upcoming'
  if (upcoming) visible.sort(byReleaseDate)

  return (
    <div>
      <PageHeader
        title={profile?.username ? `${profile.username}'s backlog` : 'My backlog'}
        subtitle="Everything you're definitely going to get around to finishing."
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
          {upcoming && <p>Nothing coming up. Titles you add before they're out wait here until release.</p>}
        </EmptyState>
      )}

      {upcoming ? (
        <div className="media-grid">
          {visible.map((entry) => (
            <MediaCard
              key={entry.id}
              mediaItem={entry.mediaItem}
              coverActions={<EntryMenu onRemove={() => void removeEntry(entry)} />}
              actions={<RecommendControl media={{ mediaItemId: entry.mediaItem.id }} title={entry.mediaItem.title} />}
              detailsActions={
                <>
                  <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} title={entry.mediaItem.title} />
                  <DetailsRemoveButton onRemove={() => void removeEntry(entry)} />
                </>
              }
            />
          ))}
        </div>
      ) : (
        <SortableGrid ids={visible.map((entry) => entry.id)} onMove={(from, to) => void moveEntry(from, to)}>
          {visible.map((entry) => (
            <SortableEntry key={entry.id} id={entry.id}>
              <MediaCard
                mediaItem={entry.mediaItem}
                progress={entry.progress}
                stackCovers={entry.covers}
                onSeriesAdded={load}
                details={entry.mediaItem.kind === 'series' && <SeriesVolumes entry={entry} onChanged={load} />}
                coverActions={
                  <>
                    <MoveShortcuts entry={entry} onMove={(to) => void moveTo(entry, to)} />
                    <EntryMenu
                      onRemove={() => void removeEntry(entry)}
                      actions={
                        entry.status === 'done'
                          ? [
                              {
                                label: 'Resume',
                                icon: <PlayIcon />,
                                onClick: () => void moveTo(entry, 'in_progress'),
                              },
                              {
                                label: 'Move to backlog',
                                icon: <UndoIcon />,
                                onClick: () => void moveTo(entry, 'want'),
                              },
                            ]
                          : []
                      }
                    />
                  </>
                }
                // Once it's finished, recommending it is the main thing left to do, so it's the
                // card's one button; its moves wait in the ⋯ menu.
                actions={
                  entry.status === 'done' ? (
                    <RecommendControl
                      media={{ mediaItemId: entry.mediaItem.id }}
                      title={entry.mediaItem.title}
                      primary
                    />
                  ) : (
                    <>
                      <MainMoveButton
                        entry={entry}
                        onMove={(to) => moveTo(entry, to, { easeOut: to !== 'done' })}
                      />
                      <RecommendControl media={{ mediaItemId: entry.mediaItem.id }} title={entry.mediaItem.title} />
                    </>
                  )
                }
                detailsActions={
                  <>
                    <DetailsMoves entry={entry} onMove={(to) => void moveTo(entry, to)} />
                    <RecommendControl
                      media={{ mediaItemId: entry.mediaItem.id }}
                      title={entry.mediaItem.title}
                      primary={entry.status === 'done'}
                    />
                    <DetailsRemoveButton onRemove={() => void removeEntry(entry)} />
                  </>
                }
              />
            </SortableEntry>
          ))}
        </SortableGrid>
      )}

      {removing && (
        <Toast
          key={removing.id}
          message={`Removed ${removing.mediaItem.title}`}
          duration={UNDO_MS}
          action={{ label: 'Undo', onClick: undoRemoval }}
        />
      )}
      {moved && (
        <Toast
          key={moved.entry.id}
          message={moveMessage(moved.entry, moved.to)}
          duration={UNDO_MS}
          action={{ label: 'Undo', onClick: undoMove }}
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
      data-entry-id={id}
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

// Finishing plays out before the entry leaves the tab: on the button, the label is wiped away and
// the tick slides to the middle and grows (CSS, via is-finishing); then the card itself jiggles,
// swells and pops. The card is animated in script so it's free of React's className and
// dnd-kit's transform on its wrapper.
const FINISH_BUTTON_MS = 950

// No starting frame, so the jiggle picks up from wherever the card is (lifted, while hovered).
// One wobble each way, then it settles.
const CARD_JIGGLE: Keyframe[] = [
  { transform: 'scale(1.02) rotate(-1deg)', offset: 0.35 },
  { transform: 'scale(1.035) rotate(1deg)', offset: 0.7 },
  { transform: 'scale(1.04) rotate(0deg)' },
]

// Like a bubble: it goes taut, then is simply gone, shrinking a little as it vanishes rather than
// flying out at you.
const CARD_POP: Keyframe[] = [
  { transform: 'scale(1.04)', opacity: 1 },
  { transform: 'scale(1.07)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
  { transform: 'scale(0.94)', opacity: 0 },
]

// The undo toast's account of a move.
function moveMessage(entry: ListEntry, to: ListStatus) {
  const { title } = entry.mediaItem
  if (to === 'done') return `Finished ${title}`
  if (to === 'in_progress') return entry.status === 'done' ? `Resumed ${title}` : `Started ${title}`
  return `Moved ${title} to backlog`
}

// A card leaving its tab by any move but Finished: a quiet fade as it settles back a little.
const CARD_EXIT: Keyframe[] = [{ opacity: 0, transform: 'scale(0.95)' }]

// Where each card on the board is, by entry id, for sliding them on from there.
function cardRects() {
  const cards = document.querySelectorAll<HTMLElement>('[data-entry-id]')
  return new Map(Array.from(cards, (card) => [card.dataset.entryId!, card.getBoundingClientRect()]))
}

// The spray of a popped bubble: dots set round the card's outline fly a little way out and fade.
// Laid over the page rather than in the card, which is on its way out.
const BURST_DOTS = 12

function popBurst(rect: DOMRect) {
  const burst = document.createElement('div')
  burst.className = 'pop-burst'
  burst.style.left = `${rect.left + window.scrollX + rect.width / 2}px`
  burst.style.top = `${rect.top + window.scrollY + rect.height / 2}px`
  const animations = Array.from({ length: BURST_DOTS }, (_, i) => {
    const angle = (i / BURST_DOTS) * 2 * Math.PI
    const [x, y] = [Math.cos(angle), Math.sin(angle)]
    const [rx, ry] = [rect.width * 0.45, rect.height * 0.45]
    const dot = burst.appendChild(document.createElement('span'))
    return dot.animate(
      [
        { transform: `translate(${x * rx}px, ${y * ry}px) scale(1)`, opacity: 1 },
        { transform: `translate(${x * (rx + 28)}px, ${y * (ry + 28)}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 450, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)', fill: 'forwards' },
    )
  })
  document.body.appendChild(burst)
  void Promise.all(animations.map((animation) => animation.finished)).finally(() => burst.remove())
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

// The first move is the card's soft primary button (Start or Finished; a finished card leads with Recommend).
function MainMoveButton({ entry, onMove }: { entry: ListEntry; onMove: (to: ListStatus) => void | Promise<void> }) {
  const [finishing, setFinishing] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const main = STATUS_ACTIONS[entry.status][0]
  const face = moveFace(entry, main)
  const classes = [
    'entry-move btn-primary btn-soft',
    main.to === 'done' && 'entry-move--finish',
    finishing && 'is-finishing',
  ]
  const move = async () => {
    if (main.to !== 'done' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return onMove(main.to)
    if (finishing) return
    setFinishing(true)
    const card = buttonRef.current?.closest<HTMLElement>('.media-card')
    const animations: Animation[] = []
    await wait(FINISH_BUTTON_MS)
    if (card) {
      // Above its neighbours while it swells over them.
      card.style.zIndex = '1'
      animations.push(card.animate(CARD_JIGGLE, { duration: 380, easing: 'ease-in-out', fill: 'forwards' }))
      await animations[0].finished
      // Held at the end (invisible) until the move lands and the card leaves the tab. The burst
      // starts as it begins to vanish.
      animations.push(card.animate(CARD_POP, { duration: 220, fill: 'forwards' }))
      const rect = card.getBoundingClientRect()
      window.setTimeout(() => popBurst(rect), 130)
      await animations[1].finished
    }
    try {
      await onMove(main.to)
    } catch (error) {
      // The card stays put, so bring it back as it was.
      for (const animation of animations) animation.cancel()
      if (card) card.style.zIndex = ''
      setFinishing(false)
      throw error
    }
  }
  return (
    <button
      ref={buttonRef}
      className={classes.filter(Boolean).join(' ')}
      onClick={() => void move()}
      aria-label={face.more && `${face.label} ${face.more}`}
    >
      {/* A tick that sat beside "Finished" all the time would be noise; it draws itself in on hover. */}
      {face.icon}
      {/* Two spans so the label can both shrink (outer, a grid column) and be wiped (inner). The
          rest of Start's wording is written in on hover, the same way, but opening. */}
      <span className="entry-move-label">
        <span>
          {face.label}
          {face.more && (
            <span className="entry-move-more">
              <span>{`\u00a0${face.more}`}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

// In the details dialog there's room to spell every move out, the first one primary as on the card.
// They get a row of their own, above the actions that don't change the entry's status.
function DetailsMoves({ entry, onMove }: { entry: ListEntry; onMove: (to: ListStatus) => void }) {
  return (
    <div className="details-moves">
      {STATUS_ACTIONS[entry.status].map((action, index) => {
        const face = moveFace(entry, action)
        const primary = index === 0 && entry.status !== 'done'
        return (
          <button key={action.to} className={primary ? 'btn-primary' : undefined} onClick={() => onMove(action.to)}>
            {face.icon}
            {face.more ? `${face.label} ${face.more}` : face.label}
          </button>
        )
      })}
    </div>
  )
}

// The card tucks removing behind a menu so it's not one stray tap away; the dialog has room to
// show it outright, and the undo toast covers a slip.
function DetailsRemoveButton({ onRemove }: { onRemove: () => void }) {
  return (
    <button className="details-remove btn-quiet btn-danger" onClick={onRemove}>
      <TrashIcon />
      Remove
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
