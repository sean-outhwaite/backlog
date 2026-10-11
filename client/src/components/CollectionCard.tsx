import { Link } from 'react-router-dom'
import type { CollectionSummary } from '../types'
import { BookmarkIcon, StarIcon } from './icons'
import { CoverStack } from './MediaCard'

// A list as a card: its newest covers piled up, its name and how many titles it has.
export function CollectionCard({ collection }: { collection: CollectionSummary }) {
  const isPicks = collection.kind === 'picks'
  return (
    <Link to={`/lists/${collection.id}`} className="media-card collection-card">
      <span className="media-card-cover collection-card-cover">
        {collection.covers.length ? (
          <CoverStack covers={collection.covers} />
        ) : (
          <span className="collection-card-empty">{isPicks ? <StarIcon /> : <BookmarkIcon />}</span>
        )}
        {isPicks && (
          <span className="media-card-type">
            <StarIcon />
            For all friends
          </span>
        )}
      </span>
      <span className="media-card-body">
        <span className="media-card-heading">
          <h3>{collection.name}</h3>
          <span className="media-card-year">
            {collection.itemCount} {collection.itemCount === 1 ? 'title' : 'titles'}
          </span>
        </span>
        {collection.description && <span className="collection-card-description">{collection.description}</span>}
      </span>
    </Link>
  )
}
