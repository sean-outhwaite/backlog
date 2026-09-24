import type { ReactNode } from 'react'
import type { MediaItem } from '../types'
import { MEDIA_TYPE_LABELS } from '../lib/mediaTypes'
import { MediaTypeIcon } from './icons'

export function MediaCard({
  mediaItem,
  actions,
}: {
  mediaItem: Pick<MediaItem, 'type' | 'title' | 'coverImageUrl'>
  actions?: ReactNode
}) {
  return (
    <article className={`media-card media-card--${mediaItem.type}`}>
      <div className="media-card-cover">
        {mediaItem.coverImageUrl ? (
          <img src={mediaItem.coverImageUrl} alt="" loading="lazy" />
        ) : (
          <div className="media-card-placeholder">
            <MediaTypeIcon type={mediaItem.type} />
            <span>{mediaItem.title}</span>
          </div>
        )}
        <span className="media-card-type">
          <MediaTypeIcon type={mediaItem.type} />
          {MEDIA_TYPE_LABELS[mediaItem.type]}
        </span>
      </div>
      <div className="media-card-body">
        <h3 title={mediaItem.title}>{mediaItem.title}</h3>
        {actions && <div className="media-card-actions">{actions}</div>}
      </div>
    </article>
  )
}
