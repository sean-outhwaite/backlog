import type { ComponentType } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { ListIcon, LogoMark, SearchIcon, SparklesIcon, UsersIcon } from './icons'
import { UserMenu } from './UserMenu'

// shortLabel is what the mobile bottom bar shows, where there's only room for a word.
const NAV_ITEMS: { to: string; label: string; shortLabel: string; icon: ComponentType; end?: boolean }[] = [
  { to: '/', label: 'My list', shortLabel: 'List', icon: ListIcon, end: true },
  { to: '/search', label: 'Search', shortLabel: 'Search', icon: SearchIcon },
  { to: '/friends', label: 'Friends', shortLabel: 'Friends', icon: UsersIcon },
  { to: '/recommendations', label: 'Recommendations', shortLabel: 'For you', icon: SparklesIcon },
]

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <NavLink to="/" className="app-title">
          <LogoMark />
          Backlog
        </NavLink>
        <nav className="app-nav">
          {NAV_ITEMS.map(({ to, label, shortLabel, icon: NavIcon, end }) => (
            <NavLink key={to} to={to} end={end} aria-label={label}>
              <NavIcon />
              <span className="app-nav-label">{label}</span>
              <span className="app-nav-short-label" aria-hidden="true">
                {shortLabel}
              </span>
            </NavLink>
          ))}
        </nav>
        <UserMenu />
      </aside>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
