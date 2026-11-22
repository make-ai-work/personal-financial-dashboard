// Sign-in state for the app. Sign in with Google (src/auth/AuthContext.jsx) or continue as Demo User; the state machine is just:
//   signedOut --signIn--> ready --signOut--> signedOut
// Nothing about who you are is stored. (The two-step verification preview that used to sit in between has been removed.)

export const PHASE = { signedOut: 'signedOut', ready: 'ready' }

export function nextPhase(phase, event) {
  switch (event) {
    case 'signIn': return phase === PHASE.signedOut ? PHASE.ready : phase
    case 'signOut': return PHASE.signedOut
    default: return phase
  }
}

// "Continue without signing in": sample data in memory, nothing saved or sent.
export const DEMO_USER = { name: 'Demo User', email: 'demo@example.com', demo: true }
