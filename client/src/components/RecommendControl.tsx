import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../lib/api'
import { getFriends } from '../lib/friends'
import { CheckIcon, SearchIcon, SendIcon } from './icons'
import { Spinner } from './Spinner'
import type { MediaRef, Profile } from '../types'

// Past this many friends the picker gets a search box.
const SEARCH_THRESHOLD = 6

const friendName = (friend: Profile) => friend.username ?? 'Unnamed friend'

// A "Recommend" button that opens a picker for sending the title to one or more friends.
export function RecommendControl({ media, title }: { media: MediaRef; title: string }) {
  const [friends, setFriends] = useState<Profile[]>([])
  const [open, setOpen] = useState(false)
  const [sentTo, setSentTo] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    getFriends()
      .then((found) => !cancelled && setFriends(found))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  if (friends.length === 0) return null

  const sent = sentTo.length > 0
  return (
    <>
      <button
        className={`recommend-button${sent ? ' is-sent' : ''}`}
        onClick={() => setOpen(true)}
        title={sent ? `Sent to ${sentTo.join(', ')}` : `Recommend ${title} to friends`}
      >
        {sent ? <CheckIcon /> : <SendIcon />}
        {sent ? 'Recommended' : 'Recommend'}
      </button>
      {open && (
        <RecommendDialog
          media={media}
          title={title}
          friends={friends}
          onSent={(names) => setSentTo((prev) => [...new Set([...prev, ...names])])}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function RecommendDialog({
  media,
  title,
  friends,
  onSent,
  onClose,
}: {
  media: MediaRef
  title: string
  friends: Profile[]
  onSent: (names: string[]) => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')

  useEffect(() => {
    // Guarded because StrictMode runs this twice, and showModal throws on an open dialog.
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // After showModal, which otherwise focuses the close button; React's autoFocus runs too early.
    // Not on touch screens, where the keyboard would cover the list before you've looked at it.
    if (window.matchMedia('(pointer: fine)').matches) searchRef.current?.focus()
  }, [])

  const close = () => dialogRef.current?.close()

  const sorted = [...friends].sort((a, b) => friendName(a).localeCompare(friendName(b)))
  const needle = query.trim().toLowerCase()
  const shown = needle ? sorted.filter((friend) => friendName(friend).toLowerCase().includes(needle)) : sorted

  function toggle(friendId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(friendId)) next.add(friendId)
      return next
    })
  }

  async function send() {
    setStatus('sending')
    try {
      await api.post('/api/recommendations', {
        ...media,
        toUserIds: [...selected],
        message: message.trim() || undefined,
      })
      onSent(friends.filter((friend) => selected.has(friend.id)).map(friendName))
      close()
    } catch {
      setStatus('error')
    }
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="recommend-dialog"
      aria-labelledby={headingId}
      onClose={(event) => {
        // React bubbles close through the portal to its owner; from inside the details dialog it
        // would close that too.
        event.stopPropagation()
        onClose()
      }}
      // The dialog element itself only receives clicks on its backdrop; content sits in the form.
      onClick={(event) => event.target === dialogRef.current && close()}
    >
      <form
        className="recommend"
        onSubmit={(event) => {
          event.preventDefault()
          if (selected.size > 0) void send()
        }}
      >
        <header className="recommend-header">
          <h2 id={headingId}>Recommend</h2>
          <p className="recommend-title">{title}</p>
          <button type="button" className="recommend-close btn-quiet" onClick={close} aria-label="Close">
            ✕
          </button>
        </header>

        {friends.length > SEARCH_THRESHOLD && (
          <label className="recommend-search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search friends"
              aria-label="Search friends"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        )}

        <ul className="recommend-friends" aria-label="Friends">
          {shown.map((friend) => (
            <li key={friend.id}>
              <label className="recommend-friend">
                <span className="avatar" aria-hidden="true">
                  {friendName(friend)[0].toUpperCase()}
                </span>
                <span className="recommend-friend-name">{friendName(friend)}</span>
                <input type="checkbox" checked={selected.has(friend.id)} onChange={() => toggle(friend.id)} />
              </label>
            </li>
          ))}
          {shown.length === 0 && <li className="recommend-empty">No friends match “{query.trim()}”.</li>}
        </ul>

        <textarea
          className="recommend-message"
          placeholder="Add a note (optional)"
          aria-label="Note"
          maxLength={280}
          rows={2}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />

        {status === 'error' && <p className="error-text">Couldn't send that. Try again?</p>}

        <footer className="recommend-footer">
          <button type="button" className="btn-quiet" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={selected.size === 0 || status === 'sending'}
            aria-busy={status === 'sending'}
          >
            {status === 'sending' ? <Spinner /> : <SendIcon />}
            {selected.size > 1 ? `Send to ${selected.size}` : 'Send'}
          </button>
        </footer>
      </form>
    </dialog>,
    document.body,
  )
}
