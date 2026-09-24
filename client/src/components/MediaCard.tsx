import type { ReactNode } from 'react'
import type { MediaItem } from '../types'

export function MediaCard({
  mediaItem,
  actions,
}: {
  mediaItem: Pick<MediaItem, 'type' | 'title' | 'coverImageUrl'>
  actions?: ReactNode
}) {
  return (
    <div className="media-card">
      {mediaItem.coverImageUrl && <img src={mediaItem.coverImageUrl} alt="" />}
      <div className="media-card-body">
        <span className="media-card-type">{mediaItem.type}</span>
        <h3>{mediaItem.title}</h3>
        {actions && <div className="media-card-actions">{actions}</div>}
      </div>
    </div>
  )
}
