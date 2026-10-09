import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EntryMenu } from '../components/EntryMenu'
import { RefreshIcon, UserMinusIcon } from '../components/icons'
import { EmptyState, PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { invalidateFriends } from '../lib/friends'
import type { InviteLink, Profile } from '../types'

export function Friends() {
  const [invite, setInvite] = useState<InviteLink | null>(null)
  const [friends, setFriends] = useState<Profile[]>([])
  const [copied, setCopied] = useState(false)
  const [confirmingReset, setConfirmingReset] = useState(false)
  const [removing, setRemoving] = useState<Profile | null>(null)

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

  async function resetInvite() {
    setInvite(await api.post<InviteLink>('/api/invites/mine/reset'))
    setCopied(false)
  }

  async function removeFriend(friend: Profile) {
    await api.delete(`/api/friends/${friend.id}`)
    invalidateFriends()
    setFriends((prev) => prev.filter((f) => f.id !== friend.id))
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
        <button className="invite-reset btn-quiet" onClick={() => setConfirmingReset(true)} disabled={!invite}>
          <RefreshIcon />
          Reset link
        </button>
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
            <li key={friend.id} className="friend-item">
              <Link to={`/friends/${friend.id}`} className="friend-card">
                <span className="avatar" aria-hidden="true">
                  {friend.username?.[0]?.toUpperCase()}
                </span>
                <span className="friend-name">{friend.username}</span>
                <span className="friend-arrow" aria-hidden="true">
                  →
                </span>
              </Link>
              {/* Beside the link rather than in it: a button can't sit inside a link. */}
              <div className="friend-menu">
                <EntryMenu
                  onRemove={() => setRemoving(friend)}
                  label="Remove friend"
                  icon={<UserMinusIcon />}
                  triggerClassName="btn-quiet"
                  triggerLabel={`More actions for ${friend.username ?? 'this friend'}`}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {confirmingReset && (
        <ConfirmDialog
          title="Reset your invite link?"
          confirmLabel="Reset link"
          onConfirm={resetInvite}
          onClose={() => setConfirmingReset(false)}
        >
          <p>Your current link will stop working, so anyone you've sent it to will need the new one.</p>
          <p>Friends you already have stay friends.</p>
        </ConfirmDialog>
      )}

      {removing && (
        <ConfirmDialog
          title={`Remove ${removing.username ?? 'this friend'}?`}
          confirmLabel="Remove"
          danger
          onConfirm={() => removeFriend(removing)}
          onClose={() => setRemoving(null)}
        >
          <p>You'll stop seeing each other's lists and can't send each other recommendations.</p>
          <p>To be friends again, one of you will need to share an invite link.</p>
        </ConfirmDialog>
      )}
    </div>
  )
}
