import { createContext, useCallback, useContext, useState } from 'react'
import { DEMO_USER, PHASE, nextPhase } from '../lib/auth.js'
import { isClientId, needsSetup } from '../lib/google.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ } }

// Placeholder session only: a flag in this browser. Replace with the real Google sign-in later.
export function AuthProvider({ children }) {
  const [mfaRequired, setMfaRequired] = useState(() => read('auth.mfaPreview') === '1')
  const [savedId, setSavedId] = useState(() => read('google.clientId') || '')
  const [skipped, setSkipped] = useState(() => read('google.setupSkipped') === '1')
  const clientId = savedId
  const [reviewing, setReviewing] = useState(false) // keeps the "Google is set up" card up until Continue
  const [phase, setPhase] = useState(() => (read('auth.demo') === '1' ? PHASE.ready : PHASE.signedOut))
  const go = useCallback((event, opts) => {
    setPhase((p) => {
      const n = nextPhase(p, event, opts)
      write('auth.demo', n === PHASE.ready ? '1' : '')
      return n
    })
  }, [])
  const value = {
    clientId, setup: needsSetup({ clientId, skipped }),
    saveClientId: (v) => { const id = String(v).trim(); if (!isClientId(id)) return false; setSavedId(id); write('google.clientId', id); setSkipped(false); write('google.setupSkipped', ''); setReviewing(true); return true },
    reviewing, endReview: () => setReviewing(false),
    skipSetup: () => { setSkipped(true); write('google.setupSkipped', '1') },
    phase, user: phase === PHASE.ready ? DEMO_USER : null, mfaRequired,
    signIn: () => go('signIn', { mfaRequired }),
    mfaPassed: () => go('mfaPassed'),
    mfaCancel: () => go('mfaCancel'),
    signOut: () => go('signOut'),
    setMfaRequired: (on) => { setMfaRequired(on); write('auth.mfaPreview', on ? '1' : '') },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
