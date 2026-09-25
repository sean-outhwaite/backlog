import { useState, type ReactNode } from 'react'
import type { MediaItem } from '../types'
import { MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import { CoverArt } from './CoverArt'
import { MediaDetailsDialog, type DetailsMedia } from './MediaDetailsDialog'
import { MediaTypeIcon } from './icons'

export function MediaCard({
  mediaItem,
  actions,
}: {
  mediaItem: DetailsMedia & Pick<MediaItem, 'title'>
  actions?: ReactNode
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = () => setDetailsOpen(true)

  return (
    <article className={`media-card media-card--${mediaItem.type}`}>
      <button className="media-card-cover" onClick={openDetails} tabIndex={-1} aria-hidden="true">
        <CoverArt media={mediaItem} />
        <span className="media-card-type">
          <MediaTypeIcon type={mediaItem.type} />
          {MEDIA_TYPE_LABELS[mediaItem.type]}
        </span>
      </button>
      <div className="media-card-body">
        <div className="media-card-heading">
          <h3>
            <button className="media-card-title" onClick={openDetails} title={mediaItem.title}>
              {mediaItem.title}
            </button>
          </h3>
          {mediaItem.releaseYear !== null && <span className="media-card-year">{mediaItem.releaseYear}</span>}
        </div>
        {actions && <div className="media-card-actions">{actions}</div>}
      </div>
      {detailsOpen && <MediaDetailsDialog media={mediaItem} actions={actions} onClose={() => setDetailsOpen(false)} />}
    </article>
  )
}
