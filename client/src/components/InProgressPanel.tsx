import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, LISTS_CHANGED_EVENT } from '../lib/api'
import { MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import type { ListEntry } from '../types'
import { CoverArt } from './CoverArt'
import { MediaTypeIcon } from './icons'

const MAX_FANNED = 3

// The latest thing you're in the middle of, filling the foot of the sidebar, with a count of
// the rest. The whole card links to the In progress tab. Hidden when there's nothing in progress.
export function InProgressPanel() {
  const [entries, setEntries] = useState<ListEntry[]>([])

  useEffect(() => {
    let cancelled = false
    function load() {
      api
        .get<ListEntry[]>('/api/lists')
        .then((all) => {
          if (!cancelled) setEntries(all.filter((entry) => entry.status === 'in_progress'))
        })
        .catch(() => {})
    }
    load()
    window.addEventListener(LISTS_CHANGED_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(LISTS_CHANGED_EVENT, load)
    }
  }, [])

  if (entries.length === 0) return null
  const [latest] = entries
  const othersCount = entries.length - 1
  // Up to three covers fanned out, latest in front. Rendered back to front so the DOM order
  // stacks them without z-index; data-slot says where each sits in the fan.
  const fanned = entries.slice(0, MAX_FANNED)

  return (
    <Link
      to="/?status=in_progress"
      className="in-progress-panel"
      aria-label={`In progress: ${latest.mediaItem.title}${othersCount ? ` and ${othersCount} more` : ''}`}
    >
      {/* The front cover, blurred right out, tints the card with its colours. */}
      {latest.mediaItem.coverImageUrl && (
        <span
          className="in-progress-glow"
          style={{ backgroundImage: `url(${JSON.stringify(latest.mediaItem.coverImageUrl)})` }}
          aria-hidden="true"
        />
      )}
      <span className="in-progress-label">
        <span className="in-progress-pulse" aria-hidden="true" />
        In progress
      </span>
      <span className="in-progress-covers" data-count={fanned.length}>
        {fanned
          .map((entry, slot) => (
            <span key={entry.id} className="in-progress-cover" data-slot={slot}>
              <CoverArt media={entry.mediaItem} />
            </span>
          ))
          .reverse()}
      </span>
      <span className="in-progress-text">
        {/* The badge sits beside the title rather than inside it, so the line clamp can't cut it off. */}
        <span className="in-progress-heading">
          <span className="in-progress-title">{latest.mediaItem.title}</span>
          {othersCount > 0 && <span className="in-progress-count">+{othersCount}</span>}
        </span>
        <span className="in-progress-type">
          <MediaTypeIcon type={latest.mediaItem.type} />
          {MEDIA_TYPE_LABELS[latest.mediaItem.type]}
        </span>
      </span>
    </Link>
  )
}
