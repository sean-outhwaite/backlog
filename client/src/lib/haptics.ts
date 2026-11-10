// A light haptic tick for deliberate actions (moving a title, sending a recommendation, the nav).
// Call it at the start of a tap's handler, before any await: iOS only plays it during the gesture.
//
// Android has the Vibration API. iOS Safari doesn't, but since iOS 18 it plays the system haptic
// when a native switch (<input type="checkbox" switch>) is toggled, including through a click on
// its label, so a hidden one is clicked instead. That's undocumented and could stop working in an
// iOS update; if it does, this just does nothing. It has no strength or patterns, only the tick.

let switchLabel: HTMLLabelElement | null = null

function iosSwitch() {
  if (!switchLabel) {
    switchLabel = document.createElement('label')
    switchLabel.ariaHidden = 'true'
    switchLabel.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    input.tabIndex = -1
    switchLabel.appendChild(input)
    document.body.appendChild(switchLabel)
  }
  return switchLabel
}

export function haptic() {
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(12)
      return
    }
    // Only touch screens: a mouse click has no haptics to give.
    if (window.matchMedia('(pointer: coarse)').matches) iosSwitch().click()
  } catch {
    // Haptics are a nicety; never let them break the tap.
  }
}
