import { useState, type ReactNode } from 'react'
import type { MediaItem } from '../types'
import { mediaLabel } from '../lib/mediaTypes'
import { CoverArt } from './CoverArt'
import { MediaDetailsDialog, type DetailsMedia } from './MediaDetailsDialog'
import { MediaTypeIcon, SeriesIcon } from './icons'

export function MediaCard({
  mediaItem,
  actions,
  coverActions,
  progress,
  details,
}: {
  mediaItem: DetailsMedia & Pick<MediaItem, 'title'>
  actions?: ReactNode
  // Small icon buttons pinned to the cover's top-right, level with the type tag.
  coverActions?: ReactNode
  // A series' volumes done, shown along the foot of the cover.
  progress?: { done: number; total: number }
  // Extra content for the details dialog, such as a series' volumes.
  details?: ReactNode
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = () => setDetailsOpen(true)

  return (
    <article className={`media-card media-card--${mediaItem.type}`}>
      {/* Cover actions sit beside the cover button, not in it: buttons can't nest. */}
      <div className="media-card-cover-wrap">
        <button className="media-card-cover" onClick={openDetails} tabIndex={-1} aria-hidden="true">
          <CoverArt media={mediaItem} />
          <span className="media-card-type">
            {mediaItem.kind === 'series' ? <SeriesIcon /> : <MediaTypeIcon type={mediaItem.type} />}
            {mediaLabel(mediaItem)}
          </span>
          {progress && progress.total > 0 && (
            <>
              <span className="media-card-progress-count">
                {progress.done} / {progress.total}
              </span>
              <span className="media-card-progress-bar">
                <span style={{ width: `${(progress.done / progress.total) * 100}%` }} />
              </span>
            </>
          )}
        </button>
        {coverActions && <div className="media-card-cover-actions">{coverActions}</div>}
      </div>
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
      {detailsOpen && (
        <MediaDetailsDialog
          media={mediaItem}
          actions={
            <>
              {coverActions}
              {actions}
            </>
          }
          onClose={() => setDetailsOpen(false)}
        >
          {details}
        </MediaDetailsDialog>
      )}
    </article>
  )
}
