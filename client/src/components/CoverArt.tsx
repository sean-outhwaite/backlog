import type { MediaItem } from '../types'
import { MediaTypeIcon } from './icons'

// A title's cover, or a generated stand-in (type icon + title) when the provider has none.
export function CoverArt({ media }: { media: Pick<MediaItem, 'type' | 'title' | 'coverImageUrl'> }) {
  if (media.coverImageUrl) return <img src={media.coverImageUrl} alt="" loading="lazy" />
  return (
    <div className="cover-placeholder">
      <MediaTypeIcon type={media.type} />
      <span>{media.title}</span>
    </div>
  )
}
