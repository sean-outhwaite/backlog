import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function Layout() {
  const { profile, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">Backlog</span>
        <nav className="app-nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            My List
          </NavLink>
          <NavLink to="/search" className={({ isActive }) => (isActive ? 'active' : '')}>
            Search
          </NavLink>
          <NavLink to="/friends" className={({ isActive }) => (isActive ? 'active' : '')}>
            Friends
          </NavLink>
          <NavLink to="/recommendations" className={({ isActive }) => (isActive ? 'active' : '')}>
            Recommendations
          </NavLink>
        </nav>
        <div className="app-user">
          <span>{profile?.username}</span>
          <button onClick={() => void signOut()}>Sign out</button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
