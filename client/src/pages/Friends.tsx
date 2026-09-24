import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import type { InviteLink, Profile } from '../types'

export function Friends() {
  const [invite, setInvite] = useState<InviteLink | null>(null)
  const [friends, setFriends] = useState<Profile[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api.get<InviteLink>('/api/invites/mine').then(setInvite)
    api.get<Profile[]>('/api/friends').then(setFriends)
  }, [])

  const inviteUrl = invite ? `${window.location.origin}/invite/${invite.token}` : ''

  async function copyInviteUrl() {
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <PageHeader title="Friends" subtitle="See what your friends are into, and send them things you love." />

      <section className="panel">
        <h2>Your invite link</h2>
        <p>Share this so a friend can connect with you.</p>
        <div className="invite-link-row">
          <input readOnly value={inviteUrl} onFocus={(event) => event.target.select()} />
          <button className="btn-primary" onClick={() => void copyInviteUrl()}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </section>

      <section>
        <h2>Your friends</h2>
        {friends.length === 0 && (
          <EmptyState>
            <p>No friends yet. Share your invite link to get started.</p>
          </EmptyState>
        )}
        <ul className="friend-list">
          {friends.map((friend) => (
            <li key={friend.id}>
              <Link to={`/friends/${friend.id}`} className="friend-card">
                <span className="avatar" aria-hidden="true">
                  {friend.username?.[0]?.toUpperCase()}
                </span>
                <span className="friend-name">{friend.username}</span>
                <span className="friend-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
