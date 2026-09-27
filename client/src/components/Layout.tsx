import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogoMark } from './icons'

export function Layout() {
  const { profile, signOut } = useAuth()

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
          <div className="app-user">
            <span className="avatar" aria-hidden="true">
              {profile?.username?.[0]?.toUpperCase()}
            </span>
            <span className="app-username">{profile?.username}</span>
            <button className="btn-quiet" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
