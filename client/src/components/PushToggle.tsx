import { useEffect, useState } from 'react'
import { disablePush, enablePush, getPushState, type PushState } from '../lib/push'

const DESCRIPTION: Record<PushState, string> = {
  unsupported: "This browser can't show notifications from Backlog.",
  install:
    'To get notifications on your iPhone or iPad, add Backlog to your Home Screen (Share, then Add to Home Screen) and turn them on from there.',
  denied: 'Notifications are blocked for Backlog. Allow them in your browser or device settings, then come back here.',
  off: 'Get a notification on this device when a friend recommends something, or a title you’re waiting on comes out.',
  on: 'On for this device. You’ll get a notification when a friend recommends something, or a title you’re waiting on comes out.',
}

// Push notifications for this device, on the Notifications page. Each device opts in separately.
export function PushToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getPushState()
      .then(setState)
      .catch(() => setState('unsupported'))
  }, [])

  if (!state) return null

  async function toggle(turnOn: boolean) {
    setBusy(true)
    setError(null)
    try {
      setState(await (turnOn ? enablePush() : disablePush()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
      setState(await getPushState().catch(() => state))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="push-toggle panel" aria-labelledby="push-toggle-heading">
      <div className="push-toggle-text">
        <h2 id="push-toggle-heading">Push notifications</h2>
        <p>{DESCRIPTION[state]}</p>
        {error && <p className="error-text">{error}</p>}
      </div>
      {(state === 'off' || state === 'on') && (
        <button
          type="button"
          className={state === 'off' ? 'btn-primary' : undefined}
          disabled={busy}
          onClick={() => void toggle(state === 'off')}
        >
          {busy ? 'Saving…' : state === 'off' ? 'Turn on' : 'Turn off'}
        </button>
      )}
    </section>
  )
}
