import { useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { NotificationsProvider, useNotifications } from '../hooks/useNotifications'
import type { UnreadCounts } from '../types'
import { InProgressPanel } from './InProgressPanel'
import { NotificationsMenu } from './NotificationsMenu'
import { ListIcon, LogoMark, SearchIcon, SparklesIcon, UsersIcon } from './icons'
import { UserMenu } from './UserMenu'

// shortLabel is what the mobile bottom bar shows, where there's only room for a word. badge names
// the unread count shown on the item.
const NAV_ITEMS: {
  to: string
  label: string
  shortLabel: string
  icon: ComponentType
  end?: boolean
  badge?: keyof UnreadCounts
}[] = [
  { to: '/', label: 'My backlog', shortLabel: 'List', icon: ListIcon, end: true },
  { to: '/search', label: 'Search', shortLabel: 'Search', icon: SearchIcon },
  { to: '/friends', label: 'Friends', shortLabel: 'Friends', icon: UsersIcon },
  {
    to: '/recommendations',
    label: 'Recommendations',
    shortLabel: 'For you',
    icon: SparklesIcon,
    badge: 'recommendation',
  },
]

// Where the active item's highlight sits, relative to the nav: the whole link in the sidebar,
// just the icon in the mobile bottom bar. Both are measured and the CSS picks per breakpoint.
type Box = { x: number; y: number; w: number; h: number }
type Indicator = { link: Box; icon: Box }

// Relative to the container's padding box (what absolute positioning uses), so its border,
// like the bottom bar's top rule, is taken off.
function boxWithin(el: Element, container: Element): Box {
  const rect = el.getBoundingClientRect()
  const origin = container.getBoundingClientRect()
  return {
    x: rect.left - origin.left - container.clientLeft,
    y: rect.top - origin.top - container.clientTop,
    w: rect.width,
    h: rect.height,
  }
}

function indicatorVars({ link, icon }: Indicator) {
  return {
    '--link-x': `${link.x}px`,
    '--link-y': `${link.y}px`,
    '--link-w': `${link.w}px`,
    '--link-h': `${link.h}px`,
    '--icon-x': `${icon.x}px`,
    '--icon-y': `${icon.y}px`,
    '--icon-w': `${icon.w}px`,
    '--icon-h': `${icon.h}px`,
  } as CSSProperties
}

export function Layout() {
  return (
    <NotificationsProvider>
      <Shell />
    </NotificationsProvider>
  )
}

function Shell() {
  const { pathname } = useLocation()
  const { unread } = useNotifications()
  const navRef = useRef<HTMLElement>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)

  // The highlight is one element that slides to whichever item is active, like the status tabs'
  // underline. Re-measured on resize, since the layout flips to the bottom bar below 720px.
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const measure = () => {
      const active = nav.querySelector('a.active')
      const icon = active?.querySelector('.icon')
      setIndicator(active && icon ? { link: boxWithin(active, nav), icon: boxWithin(icon, nav) } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [pathname])

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <NavLink to="/" className="app-title">
            <LogoMark />
            Backlog
          </NavLink>
          <NotificationsMenu />
        </div>
        <nav className="app-nav" ref={navRef}>
          {indicator && <span className="app-nav-indicator" aria-hidden="true" style={indicatorVars(indicator)} />}
          {NAV_ITEMS.map(({ to, label, shortLabel, icon: NavIcon, end, badge }) => {
            const count = badge ? unread[badge] : 0
            return (
              <NavLink key={to} to={to} end={end} aria-label={count ? `${label}, ${count} new` : label}>
                <NavIcon />
                <span className="app-nav-label">{label}</span>
                <span className="app-nav-short-label" aria-hidden="true">
                  {shortLabel}
                </span>
                {count > 0 && (
                  <span className="nav-badge" aria-hidden="true">
                    {count > 9 ? '9+' : count}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>
        <InProgressPanel />
        <UserMenu />
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
