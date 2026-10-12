import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../lib/api'
import type { AppNotification, NotificationType, UnreadCounts } from '../types'

// While the tab is visible, how often to look for new notifications between navigations.
const POLL_MS = 2 * 60 * 1000

const NONE: UnreadCounts = { total: 0, recommendation: 0, released: 0 }

interface NotificationsContextValue {
  unread: UnreadCounts
  markRead: (type?: NotificationType) => Promise<void>
  markSeen: (notifications: AppNotification[]) => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

// Unread counts for the bell and the nav badges. No realtime: they're refreshed on every
// navigation, when the tab comes back into view, and every couple of minutes while it's visible.
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [unread, setUnread] = useState<UnreadCounts>(NONE)

  const refresh = useCallback(() => {
    api
      .get<UnreadCounts>('/api/notifications/unread')
      .then(setUnread)
      .catch(() => {})
  }, [])

  useEffect(refresh, [pathname, refresh])

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    const timer = setInterval(onVisible, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  const markRead = useCallback(
    async (type?: NotificationType) => {
      // Optimistic: the badge clears straight away.
      setUnread((current) => (type ? { ...current, [type]: 0, total: current.total - current[type] } : NONE))
      await api.post('/api/notifications/read', type ? { type } : undefined)
      // A count fetched while the request was in flight could have put the badge back.
      refresh()
    },
    [refresh],
  )

  // Marks just these read, e.g. the few the bell menu has room for, leaving the rest unread.
  const markSeen = useCallback(
    async (notifications: AppNotification[]) => {
      const seen = notifications.filter((notification) => !notification.readAt)
      if (seen.length === 0) return
      const count = (type: NotificationType) => seen.filter((notification) => notification.type === type).length
      setUnread((current) => ({
        total: Math.max(0, current.total - seen.length),
        recommendation: Math.max(0, current.recommendation - count('recommendation')),
        released: Math.max(0, current.released - count('released')),
      }))
      await api.post('/api/notifications/read', { ids: seen.map((notification) => notification.id) })
      refresh()
    },
    [refresh],
  )

  return (
    <NotificationsContext.Provider value={{ unread, markRead, markSeen }}>{children}</NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) throw new Error('useNotifications must be used within a NotificationsProvider')
  return context
}
