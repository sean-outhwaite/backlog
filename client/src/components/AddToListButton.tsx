import { useId, useRef, useState, type ReactNode } from 'react'
import { usePopover } from '../hooks/usePopover'
import { haptic } from '../lib/haptics'
import type { ListStatus } from '../types'
import { BookmarkIcon, CheckIcon, PlayIcon, PlusIcon, TrophyIcon } from './icons'
import { Spinner } from './Spinner'

const ADDED_LABELS: Record<ListStatus, string> = { want: 'In backlog', in_progress: 'In progress', done: 'Finished' }
const ADDED_ICONS: Record<ListStatus, ReactNode> = { want: <BookmarkIcon />, in_progress: <PlayIcon />, done: <TrophyIcon /> }
const ADDING_LABELS: Record<ListStatus, string> = { want: 'Backlogging…', in_progress: 'Starting…', done: 'Finishing…' }

// Adds to the backlog in one click; the ▾ beside it adds straight to in progress or done instead.
// Pass upcoming for unreleased titles, which can only be wanted. added can be the status the title
// already has on your list, which the button shows (and the card's border colours, see App.css);
// true means it's on there with a status this page doesn't know.
export function AddToListButton({
  added,
  onAdd,
  label = 'Backlog',
  icon,
  primary = true,
  title,
  upcoming = false,
}: {
  added: boolean | ListStatus
  onAdd: (status: ListStatus) => Promise<void>
  label?: string
  icon?: ReactNode
  primary?: boolean
  title?: string
  upcoming?: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [failed, setFailed] = useState(false)
  const [addedAs, setAddedAs] = useState<ListStatus>('want')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  usePopover(open, setOpen, rootRef, triggerRef)
  const shownStatus = typeof added === 'string' ? added : addedAs

  async function add(status: ListStatus) {
    haptic()
    setOpen(false)
    setAddedAs(status)
    setAdding(true)
    setFailed(false)
    try {
      await onAdd(status)
    } catch {
      setFailed(true)
    } finally {
      setAdding(false)
    }
  }

  // While it adds, the plus spins (a button with its own icon, like Add series, gets a spinner).
  let content
  if (adding) {
    content = (
      <>
        {icon ? <Spinner /> : <PlusIcon />}
        {ADDING_LABELS[addedAs]}
      </>
    )
  } else if (added) {
    content = (
      <>
        {ADDED_ICONS[shownStatus]}
        {ADDED_LABELS[shownStatus]}
      </>
    )
  } else {
    content = (
      <>
        {icon ?? <PlusIcon />}
        {failed ? 'Try again' : label}
      </>
    )
  }

  // The soft primary, like the backlog's own card buttons.
  const tint = primary ? 'btn-primary btn-soft ' : ''
  const offerStatuses = !added && !upcoming

  return (
    // While adding, the ▾ folds away into the main half (is-busy), then is gone once added.
    <div className={`add-split${offerStatuses ? ' has-menu' : ''}${adding ? ' is-busy' : ''}`} ref={rootRef}>
      <button
        className={`${tint}add-button${added ? ' is-added' : ''}`}
        data-status={added ? shownStatus : undefined}
        title={title}
        onClick={() => void add('want')}
        disabled={adding || !!added}
        aria-busy={adding}
      >
        {content}
      </button>
      {offerStatuses && (
        <button
          ref={triggerRef}
          className={`${tint}btn-icon add-split-trigger`}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label="Add as started or finished"
          title="Add as started or finished"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          disabled={adding}
        >
          <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {open && (
        <div className="add-split-panel" id={panelId}>
          <button className="add-split-item btn-quiet" onClick={() => void add('in_progress')} autoFocus>
            <PlayIcon />
            Started
          </button>
          <button className="add-split-item btn-quiet" onClick={() => void add('done')}>
            <CheckIcon />
            Finished
          </button>
        </div>
      )}
    </div>
  )
}
