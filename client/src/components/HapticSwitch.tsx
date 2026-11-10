import type { MouseEvent } from 'react'
import { usesSwitchHaptics } from '../lib/haptics'

// Put inside a button or link that should buzz on iOS (see lib/haptics.ts). It covers its parent,
// so the tap lands on the switch, which plays the haptic as it toggles; the click is then stopped
// and sent on to the parent, so the parent's own handler (or link) runs as if tapped directly.
export function HapticSwitch() {
  if (!usesSwitchHaptics) return null

  function passOn(event: MouseEvent<HTMLInputElement>) {
    event.stopPropagation()
    event.currentTarget.parentElement?.click()
  }

  return (
    <input
      type="checkbox"
      // React doesn't know the attribute yet; an empty string renders it bare.
      {...{ switch: '' }}
      className="haptic-switch"
      tabIndex={-1}
      aria-hidden="true"
      onClick={passOn}
    />
  )
}
