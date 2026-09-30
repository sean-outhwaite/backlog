import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { fetchMediaDetails } from '../lib/mediaDetails'
import { MEDIA_SOURCE_NAMES, mediaLabel } from '../lib/mediaTypes'
import type { MediaDetails, MediaItem } from '../types'
import { CoverArt } from './CoverArt'
import { MediaTypeIcon } from './icons'
import { Spinner } from './Spinner'

export type DetailsMedia = Pick<MediaItem, 'type' | 'externalId' | 'title' | 'coverImageUrl' | 'releaseYear'> &
  Partial<Pick<MediaItem, 'kind'>>

// Shows what the card already knows straight away, then fills in the rest from the provider.
export function MediaDetailsDialog({
  media,
  actions,
  children,
  onClose,
}: {
  media: DetailsMedia
  actions?: ReactNode
  // Extra content below the description, such as a series' volumes.
  children?: ReactNode
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [details, setDetails] = useState<MediaDetails | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    // Deliberately no cleanup close(): that would fire onClose and unmount us straight away.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMediaDetails(media.type, media.externalId, media.kind)
      .then((found) => !cancelled && setDetails(found))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [media.type, media.externalId, media.kind])

  const close = () => dialogRef.current?.close()
  const coverStyle = media.coverImageUrl ? ({ '--cover': `url("${media.coverImageUrl}")` } as CSSProperties) : undefined

  return createPortal(
    <dialog
      ref={dialogRef}
      className="details-dialog"
      aria-labelledby="details-title"
      onClose={onClose}
      // The dialog element itself only receives clicks on its backdrop; content sits in .details.
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <div className={`details${media.coverImageUrl ? ' has-cover' : ''}`} style={coverStyle}>
        <button className="details-close btn-quiet" onClick={close} aria-label="Close">
          ✕
        </button>

        <div className="details-cover">
          <CoverArt media={media} />
        </div>

        <div className="details-info">
          <p className="details-kicker">
            <MediaTypeIcon type={media.type} />
            {mediaLabel(media)}
            {(details?.releaseYear ?? media.releaseYear) && <> · {details?.releaseYear ?? media.releaseYear}</>}
          </p>
          <h2 id="details-title">{media.title}</h2>
          {details?.tagline && <p className="details-tagline">{details.tagline}</p>}

          {!details && !failed && (
            <p className="details-loading" role="status">
              <Spinner /> Loading details…
            </p>
          )}
          {failed && <p className="error-text">Couldn't load more details right now.</p>}

          {details && (
            <>
              {details.genres.length > 0 && (
                <ul className="details-genres">
                  {details.genres.map((genre) => (
                    <li key={genre}>{genre}</li>
                  ))}
                </ul>
              )}
              {details.facts.length > 0 && (
                <dl className="details-facts">
                  {details.facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {details.description && <p className="details-description">{details.description}</p>}
            </>
          )}

          {children}

          {actions && <div className="details-actions">{actions}</div>}

          {details && (
            <a className="details-source" href={details.url} target="_blank" rel="noreferrer">
              View on {MEDIA_SOURCE_NAMES[media.type]} ↗
            </a>
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  )
}
