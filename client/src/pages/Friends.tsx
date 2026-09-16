import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
      <section>
        <h2>Your invite link</h2>
        <p>Share this so a friend can connect with you.</p>
        <div className="invite-link-row">
          <input readOnly value={inviteUrl} />
          <button onClick={() => void copyInviteUrl()}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
      </section>

      <section>
        <h2>Friends</h2>
        {friends.length === 0 && <p className="page-status">No friends yet — share your invite link.</p>}
        <ul className="friend-list">
          {friends.map((friend) => (
            <li key={friend.id}>
              <Link to={`/friends/${friend.id}`}>{friend.username}</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
