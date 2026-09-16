import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { Profile } from '../types'

export function RecommendControl({ mediaItemId }: { mediaItemId: string }) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [selectedFriendId, setSelectedFriendId] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  useEffect(() => {
    api
      .get<Profile[]>('/api/friends')
      .then(setFriends)
      .catch(() => setFriends([]))
  }, [])

  async function handleRecommend() {
    if (!selectedFriendId) return
    setStatus('sending')
    try {
      await api.post('/api/recommendations', { toUserId: selectedFriendId, mediaItemId })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (friends.length === 0) return null

  return (
    <div className="recommend-control">
      <select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)}>
        <option value="">Recommend to…</option>
        {friends.map((friend) => (
          <option key={friend.id} value={friend.id}>
            {friend.username}
          </option>
        ))}
      </select>
      <button onClick={() => void handleRecommend()} disabled={!selectedFriendId || status === 'sending'}>
        {status === 'sent' ? 'Sent!' : 'Send'}
      </button>
    </div>
  )
}
