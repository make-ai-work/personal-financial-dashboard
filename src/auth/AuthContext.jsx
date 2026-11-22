import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { DEMO_USER, PHASE, nextPhase } from '../lib/auth.js'
import { DEFAULT_CLIENT_ID, isClientId, resolveClientId } from '../lib/google.js'
import { IS_DEMO } from '../lib/demo.js'
import { isNativeApp } from '../lib/appstorage.js'
import { signInWithGoogle } from '../lib/googleauth.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ } }

// The sign-in screen is always the first screen, on every version. Two ways in:
//   Sign in with Google  -> you are a real user: your data can be saved (vault file or Google Drive). Your name and email live in memory
//                           for this session only; NOTHING about who you are is stored, so closing the app signs you out.
//   Continue without signing in -> "Demo User": sample data in memory, nothing saved or sent, until you sign in from Settings.
// The demo site is the same with Google greyed out. Only your own settings (the public client ID, preferences) are kept.
const forgetOldIdentity = () => { write('auth.user', ''); write('auth.demo', ''); write('auth.mfaPreview', ''); write('google.setupSkipped', '') } // earlier versions kept these
export function AuthProvider({ children }) {
  const [savedId, setSavedId] = useState(() => read('google.clientId') || '')
  const resolved = resolveClientId({ saved: savedId })
  const clientId = IS_DEMO ? '' : resolved.clientId // the demo site has no Google
  const [realUser, setRealUser] = useState(null) // memory only
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(() => !IS_DEMO && !isNativeApp() && isClientId(resolveClientId({ saved: read('google.clientId') || '' }).clientId) && !window.desktopApp) // the quiet attempt at start
  const [phase, setPhase] = useState(PHASE.signedOut)
  const go = useCallback((event) => setPhase((p) => nextPhase(p, event)), [])
  useEffect(forgetOldIdentity, [])
  // Quiet sign-in when the app opens (web): works only if Google already has you signed in and you approved this app before.
  useEffect(() => {
    if (!checking) return undefined
    let live = true
    signInWithGoogle(clientId, { silent: true })
      .then((u) => { if (live) { setRealUser(u); go('signIn') } })
      .catch(() => {})
      .finally(() => live && setChecking(false))
    return () => { live = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const googleReady = !IS_DEMO && isClientId(clientId)
  const value = {
    clientId, googleReady, demoSite: IS_DEMO, native: isNativeApp(),
    usingDefault: !IS_DEMO && resolved.usingDefault, hasBuiltIn: !IS_DEMO && !!DEFAULT_CLIENT_ID,
    // "Use my own…": your own Google client ID, kept in this browser. Passing '' goes back to the app's own.
    saveClientId: (v) => { const id = String(v).trim(); if (id && !isClientId(id)) return false; setSavedId(id); write('google.clientId', id); return true },
    phase, user: phase === PHASE.ready ? (realUser || DEMO_USER) : null, real: !!realUser, busy: busy || checking, checking, error,
    // Sign in with Google (also used from Settings while in demo mode, where it keeps the page you are on).
    signIn: async () => {
      setError('')
      if (!googleReady) return
      setBusy(true)
      try {
        const u = await signInWithGoogle(clientId)
        setRealUser(u)
        go('signIn')
      } catch (e) { setError(e.message || 'Google sign-in did not finish.') } finally { setBusy(false) }
    },
    continueDemo: () => { setError(''); go('signIn') }, // no Google: Demo User with sample data
    signOut: () => { setRealUser(null); setError(''); go('signOut') },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
