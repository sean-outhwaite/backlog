import { useState, type CSSProperties, type ReactNode } from 'react'
import type { MediaItem } from '../types'
import { mediaLabel, SERIES_WORDS } from '../lib/mediaTypes'
import { CoverArt } from './CoverArt'
import { MediaDetailsDialog, type DetailsMedia } from './MediaDetailsDialog'
import { MediaTypeIcon, SeriesIcon } from './icons'

export function MediaCard({
  mediaItem,
  actions,
  coverActions,
  progress,
  stackCovers,
  partCount,
  details,
  offerSeries,
  onSeriesAdded,
}: {
  mediaItem: DetailsMedia & Pick<MediaItem, 'title'>
  actions?: ReactNode
  // Small icon buttons pinned to the cover's top-right, level with the type tag.
  coverActions?: ReactNode
  // A series' volumes done, shown along the foot of the cover.
  progress?: { done: number; total: number }
  // A series' volume covers from where the reader is up to, stacked in place of the single cover.
  stackCovers?: string[]
  // How many volumes/films a series has, shown beside the year.
  partCount?: number
  // Extra content for the details dialog, such as a series' volumes.
  details?: ReactNode
  offerSeries?: boolean
  onSeriesAdded?: () => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const openDetails = () => setDetailsOpen(true)

  return (
    <article className={`media-card media-card--${mediaItem.type}`}>
      {/* Cover actions sit beside the cover button, not in it: buttons can't nest. */}
      <div className="media-card-cover-wrap">
        <button className="media-card-cover" onClick={openDetails} tabIndex={-1} aria-hidden="true">
          {stackCovers?.length ? <CoverStack covers={stackCovers} /> : <CoverArt media={mediaItem} />}
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
          {(mediaItem.releaseYear !== null || partCount) && (
            <span className="media-card-year">
              {[mediaItem.releaseYear, partCount && `${partCount} ${SERIES_WORDS[mediaItem.type].parts}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>
        {actions && <div className="media-card-actions">{actions}</div>}
      </div>
      {detailsOpen && (
        <MediaDetailsDialog
          media={mediaItem}
          offerSeries={offerSeries}
          onSeriesAdded={onSeriesAdded}
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

// Volumes fanned back to front over a blurred wash of the front one, so a series reads as a pile of
// books at a glance. Rendered back to front so DOM order stacks them; data-slot is the depth.
function CoverStack({ covers }: { covers: string[] }) {
  const style = { '--cover': `url(${JSON.stringify(covers[0])})` } as CSSProperties
  return (
    <span className="cover-stack" style={style} data-count={covers.length}>
      {covers
        .map((url, slot) => (
          <span key={url} className="cover-stack-item" data-slot={slot}>
            <img src={url} alt="" loading="lazy" />
          </span>
        ))
        .reverse()}
    </span>
  )
}
