import { createContext, useCallback, useContext, useState } from 'react'
import { DEMO_USER, PHASE, nextPhase } from '../lib/auth.js'
import { isClientId, needsSetup } from '../lib/google.js'
import { IS_DEMO } from '../lib/demo.js'
import { isNativeApp } from '../lib/appstorage.js'
import { isClientId as validId } from '../lib/google.js'
import { signInWithGoogle } from '../lib/googleauth.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ } }

// With a Google client ID saved, "Sign in with Google" is real (name and email only; see lib/googleauth.js) and the identity is
// remembered in this browser. Without one it stays the placeholder sign-in as a demo user. MFA is still only a preview screen.
const readUser = () => { try { const u = JSON.parse(read('auth.user')); return u && u.email ? u : null } catch { return null } }
export function AuthProvider({ children }) {
  const [mfaRequired, setMfaRequired] = useState(() => !IS_DEMO && read('auth.mfaPreview') === '1')
  const [savedId, setSavedId] = useState(() => read('google.clientId') || '')
  const [skipped, setSkipped] = useState(() => read('google.setupSkipped') === '1')
  const clientId = savedId
  const [realUser, setRealUser] = useState(() => (IS_DEMO ? null : readUser()))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false) // keeps the "Google is set up" card up until Continue
  const [phase, setPhase] = useState(() => (isNativeApp() || (!IS_DEMO && read('auth.demo') === '1') ? PHASE.ready : PHASE.signedOut)) // the app has nothing to sign in to // the demo always starts at the sign-in page
  const go = useCallback((event, opts) => {
    setPhase((p) => {
      const n = nextPhase(p, event, opts)
      if (!IS_DEMO) write('auth.demo', n === PHASE.ready ? '1' : '')
      return n
    })
  }, [])
  const value = {
    clientId, setup: !IS_DEMO && !isNativeApp() && needsSetup({ clientId, skipped }),
    saveClientId: (v) => { const id = String(v).trim(); if (!isClientId(id)) return false; setSavedId(id); write('google.clientId', id); setSkipped(false); write('google.setupSkipped', ''); setReviewing(true); return true },
    reviewing, endReview: () => setReviewing(false),
    skipSetup: () => { setSkipped(true); write('google.setupSkipped', '1') },
    demo: IS_DEMO, native: isNativeApp(),
    phase, user: phase === PHASE.ready ? (realUser || DEMO_USER) : null, mfaRequired, real: !!realUser, busy, error,
    googleReady: !IS_DEMO && !isNativeApp() && validId(clientId),
    signIn: async () => {
      setError('')
      if (IS_DEMO || !validId(clientId)) return go('signIn', { mfaRequired }) // the demo and the placeholder
      setBusy(true)
      try {
        const u = await signInWithGoogle(clientId)
        setRealUser(u); write('auth.user', JSON.stringify(u))
        go('signIn', { mfaRequired })
      } catch (e) { setError(e.message || 'Google sign-in did not finish.') } finally { setBusy(false) }
    },
    mfaPassed: () => go('mfaPassed'),
    mfaCancel: () => go('mfaCancel'),
    signOut: () => { setRealUser(null); write('auth.user', ''); setError(''); go('signOut') },
    setMfaRequired: (on) => { setMfaRequired(on); write('auth.mfaPreview', on ? '1' : '') },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
