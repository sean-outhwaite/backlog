// Haptic ticks for deliberate actions (moving a title, sending a recommendation, the nav).
//
// Android has the Vibration API: haptic() at the start of a tap's handler. iOS has none, and the
// one thing that buzzes from a web page is a finger landing on a native switch
// (<input type="checkbox" switch>, iOS 18+). A scripted click on one doesn't (tested on iOS 26),
// so on iOS a button that should buzz holds an invisible switch over itself (HapticSwitch), which
// takes the tap and passes it on to the button. This is undocumented and could stop working in an
// iOS update; if it does, taps still work, just without the buzz.

export function haptic() {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(12)
  } catch {
    // Haptics are a nicety; never let them break the tap.
  }
}

// Touch screens without the Vibration API, which in practice is iOS. Elsewhere HapticSwitch
// renders nothing: a mouse has no haptics, and Android buzzes through haptic().
export const usesSwitchHaptics =
  typeof window !== 'undefined' &&
  typeof navigator.vibrate !== 'function' &&
  window.matchMedia('(pointer: coarse)').matches
