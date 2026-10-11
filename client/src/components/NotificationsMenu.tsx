import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNotifications } from '../hooks/useNotifications'
import { usePopover } from '../hooks/usePopover'
import { api } from '../lib/api'
import { timeAgo } from '../lib/timeAgo'
import type { AppNotification } from '../types'
import { Avatar } from './Avatar'
import { CoverArt } from './CoverArt'
import { BellIcon } from './icons'
import { Spinner } from './Spinner'

// Bell in the sidebar (the top bar on phones). Opening it loads the latest notifications and
// marks them all read; the ones that were unread stay highlighted until it's closed.
export function NotificationsMenu() {
  const { unread, markRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  usePopover(open, setOpen, rootRef, triggerRef)

  function toggle() {
    if (open) {
      setOpen(false)
      return
    }
    setOpen(true)
    setFailed(false)
    api
      .get<AppNotification[]>('/api/notifications')
      .then((found) => {
        setNotifications(found)
        if (found.some((notification) => !notification.readAt)) void markRead()
      })
      .catch(() => setFailed(true))
  }

  const label = unread.total > 0 ? `Notifications, ${unread.total} unread` : 'Notifications'

  return (
    <div className="notifications-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        className="notifications-trigger btn-quiet"
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={label}
        title="Notifications"
        onClick={toggle}
      >
        <BellIcon />
        {unread.total > 0 && <span className="notifications-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="notifications-panel" id="notifications-panel">
          <h2 className="notifications-heading">Notifications</h2>
          {failed && <p className="notifications-empty">Couldn't load notifications.</p>}
          {!failed && notifications === null && (
            <p className="notifications-empty">
              <Spinner />
            </p>
          )}
          {notifications?.length === 0 && <p className="notifications-empty">Nothing yet.</p>}
          {!!notifications?.length && (
            <ul className="notifications-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <NotificationItem notification={notification} onFollow={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationItem({ notification, onFollow }: { notification: AppNotification; onFollow: () => void }) {
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
