import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { AuthCallback } from './pages/AuthCallback'
import { Dashboard } from './pages/Dashboard'
import { Friends } from './pages/Friends'
import { FriendList } from './pages/FriendList'
import { InviteRedeem } from './pages/InviteRedeem'
import { Onboarding } from './pages/Onboarding'
import { Privacy } from './pages/Privacy'
import { Recommendations } from './pages/Recommendations'
import { Search } from './pages/Search'
import { SignIn } from './pages/SignIn'

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/invite/:token" element={<InviteRedeem />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/privacy" element={<Privacy />} />

      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/search" element={<Search />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/friends/:id" element={<FriendList />} />
          <Route path="/recommendations" element={<Recommendations />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
