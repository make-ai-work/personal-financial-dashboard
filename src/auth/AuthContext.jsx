import { createContext, useCallback, useContext, useEffect, useState } from 'react'
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

// With a Google client ID saved, "Sign in with Google" is real (name and email only; see lib/googleauth.js). NOTHING about who you
// are is stored: the name and email live in memory for this session only, so closing or reloading the page signs you out. Only
// your own settings (the public client ID, preferences) are kept. Without a client ID it stays the placeholder sign-in as a demo user.
// MFA is still only a preview screen.
const forgetOldIdentity = () => { write('auth.user', ''); write('auth.demo', '') } // earlier versions kept these in this browser
export function AuthProvider({ children }) {
  const [mfaRequired, setMfaRequired] = useState(() => !IS_DEMO && read('auth.mfaPreview') === '1')
  const [savedId, setSavedId] = useState(() => read('google.clientId') || '')
  const [skipped, setSkipped] = useState(() => read('google.setupSkipped') === '1')
  const clientId = savedId
  const [realUser, setRealUser] = useState(null) // memory only
  useEffect(forgetOldIdentity, [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reviewing, setReviewing] = useState(false) // keeps the "Google is set up" card up until Continue
  const [phase, setPhase] = useState(() => (isNativeApp() ? PHASE.ready : PHASE.signedOut)) // the phone app has nothing to sign in to; everything else starts at the sign-in page
  const go = useCallback((event, opts) => {
    setPhase((p) => nextPhase(p, event, opts))
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
        setRealUser(u)
        go('signIn', { mfaRequired })
      } catch (e) { setError(e.message || 'Google sign-in did not finish.') } finally { setBusy(false) }
    },
    mfaPassed: () => go('mfaPassed'),
    mfaCancel: () => go('mfaCancel'),
    signOut: () => { setRealUser(null); setError(''); go('signOut') },
    setMfaRequired: (on) => { setMfaRequired(on); write('auth.mfaPreview', on ? '1' : '') },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
