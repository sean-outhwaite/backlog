import { Link } from 'react-router-dom'
import { timeAgo } from '../lib/timeAgo'
import type { AppNotification } from '../types'
import { Avatar } from './Avatar'
import { CoverArt } from './CoverArt'

// One notification, linking to where it's about. Used by the bell menu and the notifications page.
export function NotificationItem({ notification, onFollow }: { notification: AppNotification; onFollow?: () => void }) {
  const { type, actor, mediaItem } = notification
  const title = mediaItem?.title ?? 'something'
  const className = notification.readAt ? 'notification' : 'notification notification--unread'

  if (type === 'recommendation') {
    return (
      <Link to="/recommendations" className={className} onClick={onFollow}>
        <Avatar profile={actor} />
        <span className="notification-text">
          <strong>{actor?.username ?? 'A friend'}</strong> recommended <strong>{title}</strong>
          <time dateTime={notification.createdAt}>{timeAgo(notification.createdAt)}</time>
        </span>
      </Link>
    )
  }

  return (
    <Link to="/" className={className} onClick={onFollow}>
      <span className="notification-cover">{mediaItem && <CoverArt media={mediaItem} />}</span>
      <span className="notification-text">
        <strong>{title}</strong> is out now
        <time dateTime={notification.createdAt}>{timeAgo(notification.createdAt)}</time>
      </span>
    </Link>
  )
}
