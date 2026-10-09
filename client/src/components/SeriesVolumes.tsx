import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { fetchMediaDetails } from '../lib/mediaDetails'
import { SERIES_WORDS } from '../lib/mediaTypes'
import type { ListEntry, ListStatus, MediaDetails, MediaType, SeriesVolume } from '../types'
import { CoverArt } from './CoverArt'
import { CheckIcon, PlayIcon } from './icons'
import { Spinner } from './Spinner'

const STATUSES: ListStatus[] = ['want', 'in_progress', 'done']

function statusLabel(type: MediaType, status: ListStatus) {
  const words = SERIES_WORDS[type]
  return { want: words.notStarted, in_progress: words.doing, done: words.done }[status]
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// Where the user is up to: the first volume not done, or the last one once they all are.
function nextUpIndex(volumes: SeriesVolume[]) {
  const index = volumes.findIndex((volume) => volume.status !== 'done')
  return index === -1 ? volumes.length - 1 : index
}

// A series entry's volumes: a grid to pick one from, and a panel showing the picked one's details
// and status. It opens on the next volume up. Changing a volume can move the whole entry to
// another tab (see derivedSeriesStatus on the server), which would unmount the card and this
// dialog with it, so onChanged (to reload the list) only fires once it closes.
export function SeriesVolumes({ entry, onChanged }: { entry: ListEntry; onChanged: () => void }) {
  const [volumes, setVolumes] = useState<SeriesVolume[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const changed = useRef(false)
  // Saves run one at a time, so quick changes land in the order they were made.
  const saving = useRef(Promise.resolve())
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })

  const knownTotal = entry.progress?.total
  useEffect(() => {
    let cancelled = false
    api
      .get<SeriesVolume[]>(`/api/lists/${entry.id}/volumes`)
      .then((found) => {
        if (cancelled) return
        // Loading the volumes can bring the series up to date on the server, adding new ones and
        // moving a finished entry back to in progress, so the list behind needs reloading too.
        if (knownTotal !== undefined && found.length !== knownTotal) changed.current = true
        setVolumes(found)
        setSelectedId((current) => current ?? found[nextUpIndex(found)]?.id ?? null)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [entry.id, knownTotal])

  useEffect(
    () => () => {
      if (changed.current) onChangedRef.current()
    },
    [],
  )

  // Applies a change straight away, then saves it, putting the volumes back if the save fails.
  async function save(update: (prev: SeriesVolume[]) => SeriesVolume[], request: () => Promise<unknown>) {
    const before = volumes
    setVolumes((prev) => (prev ? update(prev) : prev))
    saving.current = saving.current.then(async () => {
      try {
        await request()
        changed.current = true
      } catch {
        setVolumes(before)
      }
    })
    await saving.current
  }

  function setStatus(volume: SeriesVolume, status: ListStatus) {
    return save(
      (prev) => prev.map((v) => (v.id === volume.id ? { ...v, status } : v)),
      () => api.put(`/api/lists/${entry.id}/volumes/${volume.id}`, { status }),
    )
  }

  function markEarlierDone(volume: SeriesVolume) {
    return save(
      (prev) => prev.map((v) => (v.position < volume.position ? { ...v, status: 'done' } : v)),
      () => api.post(`/api/lists/${entry.id}/volumes/${volume.id}/done-before`, {}),
    )
  }

  if (failed) return <p className="error-text">Couldn't load the volumes right now.</p>
  if (!volumes) {
    return (
      <p className="details-loading" role="status">
        <Spinner /> Loading volumes…
      </p>
    )
  }

  const done = volumes.filter((volume) => volume.status === 'done').length
  const next = volumes.find((volume) => volume.status !== 'done')
  const selected = volumes.find((volume) => volume.id === selectedId)
  const { type } = entry.mediaItem
  const words = SERIES_WORDS[type]

  return (
    <section className="series-volumes" aria-label={capitalize(words.parts)}>
      {selected && (
        <VolumePanel
          key={selected.id}
          volume={selected}
          type={type}
          isNextUp={selected.id === next?.id}
          hasEarlierUndone={volumes.some((v) => v.position < selected.position && v.status !== 'done')}
          onStatus={(status) => void setStatus(selected, status)}
          onMarkEarlierDone={() => void markEarlierDone(selected)}
        />
      )}

      <div className="series-volumes-header">
        <h3>{capitalize(words.parts)}</h3>
        <span>
          {done} of {volumes.length} {words.done}
          {next && done > 0 && <> · next up {words.partLabel(next)}</>}
        </span>
      </div>
      <ol className="series-volumes-grid">
        {volumes.map((volume) => (
          <li key={volume.id}>
            <button
              className={`series-volume series-volume--${volume.status}${volume.id === selectedId ? ' is-selected' : ''}`}
              onClick={() => setSelectedId(volume.id)}
              aria-pressed={volume.id === selectedId}
              aria-label={`${words.partLabel(volume)}: ${statusLabel(type, volume.status)}`}
              title={`${words.partLabel(volume)}: ${statusLabel(type, volume.status)}`}
            >
              <span className="series-volume-cover">
                <CoverArt media={volume} />
                {volume.status !== 'want' && (
                  <span className="series-volume-mark">
                    {volume.status === 'done' ? <CheckIcon /> : <PlayIcon />}
                  </span>
                )}
              </span>
              <span className="series-volume-label">{volume.position}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

// The selected volume: its cover, title and description (fetched live, like any title's details,
// since stored volumes often lack one), with its status and the catch-up shortcut.
function VolumePanel({
  volume,
  type,
  isNextUp,
  hasEarlierUndone,
  onStatus,
  onMarkEarlierDone,
}: {
  volume: SeriesVolume
  type: MediaType
  isNextUp: boolean
  hasEarlierUndone: boolean
  onStatus: (status: ListStatus) => void
  onMarkEarlierDone: () => void
}) {
  const [details, setDetails] = useState<MediaDetails | null>(null)
  const [failed, setFailed] = useState(false)
  const words = SERIES_WORDS[type]

  useEffect(() => {
    let cancelled = false
    fetchMediaDetails(type, volume.externalId)
      .then((found) => !cancelled && setDetails(found))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [type, volume.externalId])

  const description = details?.description ?? volume.description
  const year = details?.releaseYear ?? volume.releaseYear

  return (
    <div className="volume-panel">
      <div className="volume-panel-cover">
        <CoverArt media={volume} />
      </div>
      <div className="volume-panel-info">
        <p className="volume-panel-kicker">
          {isNextUp && <strong>Next up · </strong>}
          {words.part} {volume.position}
          {year && <> · {year}</>}
        </p>
        <h4>{volume.title}</h4>
        {description ? (
          <ClampedDescription text={description} />
        ) : !details && !failed ? (
          <p className="details-loading" role="status">
            <Spinner /> Loading description…
          </p>
        ) : (
          <p className="volume-panel-description is-empty">No description available.</p>
        )}

        <div className="volume-status" role="group" aria-label="Status">
          {STATUSES.map((status) => (
            <button
              key={status}
              className={volume.status === status ? 'active' : ''}
              aria-pressed={volume.status === status}
              onClick={() => volume.status !== status && onStatus(status)}
            >
              {capitalize(statusLabel(type, status))}
            </button>
          ))}
        </div>
        {hasEarlierUndone && (
          <button className="btn-quiet volume-panel-catch-up" onClick={onMarkEarlierDone}>
            <CheckIcon /> Mark earlier {words.parts} {words.done}
          </button>
        )}
      </div>
    </div>
  )
}

// A description cut to a few lines, with a toggle to read the rest. The toggle only shows when
// the text is actually cut off, measured rather than guessed from its length, since that depends
// on the panel's width. The panel is keyed by volume, so picking another one starts collapsed.
function ClampedDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || expanded) return
    const measure = () => setOverflowing(element.scrollHeight > element.clientHeight + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text, expanded])

  return (
    <div className="volume-panel-description-wrap">
      <p ref={ref} className={`volume-panel-description${expanded ? '' : ' is-clamped'}`}>
        {text}
      </p>
      {(overflowing || expanded) && (
        <button className="volume-panel-more" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
