import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { SERIES_WORDS } from '../lib/mediaTypes'
import type { ListEntry, ListStatus, MediaType, SeriesVolume } from '../types'
import { CoverArt } from './CoverArt'
import { CheckIcon, PlayIcon } from './icons'
import { Spinner } from './Spinner'

// Tapping a volume steps it along: not started, reading, read, and back round.
const NEXT_STATUS: Record<ListStatus, ListStatus> = { want: 'in_progress', in_progress: 'done', done: 'want' }

function statusLabel(type: MediaType, status: ListStatus) {
  const words = SERIES_WORDS[type]
  return { want: words.notStarted, in_progress: words.doing, done: words.done }[status]
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// A series entry's volumes, each toggled through its own status. Changing a volume can move the
// whole entry to another tab (see derivedSeriesStatus on the server), which would unmount the
// card and this dialog with it, so onChanged (to reload the list) only fires once it closes.
export function SeriesVolumes({ entry, onChanged }: { entry: ListEntry; onChanged: () => void }) {
  const [volumes, setVolumes] = useState<SeriesVolume[] | null>(null)
  const [failed, setFailed] = useState(false)
  const changed = useRef(false)
  // Saves run one at a time, so quick taps on a volume land in the order they were made.
  const saving = useRef(Promise.resolve())
  const onChangedRef = useRef(onChanged)
  useEffect(() => {
    onChangedRef.current = onChanged
  })

  useEffect(() => {
    let cancelled = false
    api
      .get<SeriesVolume[]>(`/api/lists/${entry.id}/volumes`)
      .then((found) => !cancelled && setVolumes(found))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [entry.id])

  useEffect(
    () => () => {
      if (changed.current) onChangedRef.current()
    },
    [],
  )

  async function setStatus(volume: SeriesVolume, status: ListStatus) {
    const apply = (next: ListStatus) =>
      setVolumes((prev) => prev?.map((v) => (v.id === volume.id ? { ...v, status: next } : v)) ?? null)
    apply(status)
    saving.current = saving.current.then(async () => {
      try {
        await api.put(`/api/lists/${entry.id}/volumes/${volume.id}`, { status })
        changed.current = true
      } catch {
        apply(volume.status)
      }
    })
    await saving.current
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
  const { type } = entry.mediaItem
  const words = SERIES_WORDS[type]

  return (
    <section className="series-volumes" aria-label={capitalize(words.parts)}>
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
              className={`series-volume series-volume--${volume.status}`}
              onClick={() => void setStatus(volume, NEXT_STATUS[volume.status])}
              aria-label={`${words.partLabel(volume)}: ${statusLabel(type, volume.status)}`}
              title={`${words.partLabel(volume)}: ${statusLabel(type, volume.status)}. Tap to mark ${statusLabel(type, NEXT_STATUS[volume.status])}.`}
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
