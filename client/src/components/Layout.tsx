import { NavLink, Outlet } from 'react-router-dom'
import { LogoMark } from './icons'
import { UserMenu } from './UserMenu'

export function Layout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <NavLink to="/" className="app-title">
            <LogoMark />
            Backlog
          </NavLink>
          <nav className="app-nav">
            <NavLink to="/" end>
              My List
            </NavLink>
            <NavLink to="/search">Search</NavLink>
            <NavLink to="/friends">Friends</NavLink>
            <NavLink to="/recommendations">Recommendations</NavLink>
          </nav>
          <UserMenu />
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
