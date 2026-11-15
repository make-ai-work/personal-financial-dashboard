// Sign-in state for the app. This is a PLACEHOLDER: "Sign in with Google" is a dummy button and the two-step
// (MFA) screen is built but not enforced. The state machine below is what the real flow will plug into:
//   signedOut --signIn--> (mfa --mfaPassed-->) ready --signOut--> signedOut
// Nothing here talks to Google, and no real identity or second factor is checked.

export const PHASE = { signedOut: 'signedOut', mfa: 'mfa', ready: 'ready' }

export function nextPhase(phase, event, { mfaRequired = false } = {}) {
  switch (event) {
    case 'signIn': return phase === PHASE.signedOut ? (mfaRequired ? PHASE.mfa : PHASE.ready) : phase
    case 'mfaPassed': return phase === PHASE.mfa ? PHASE.ready : phase
    case 'mfaCancel': return phase === PHASE.mfa ? PHASE.signedOut : phase
    case 'signOut': return PHASE.signedOut
    default: return phase
  }
}

export const DEMO_USER = { name: 'Demo user', email: 'demo@example.com', demo: true }

// Authentication is on hold: whatever is typed, a code is never treated as proof of anything.
export const MFA_ENFORCED = false
export const looksLikeCode = (s) => /^\d{6}$/.test(String(s).trim())
