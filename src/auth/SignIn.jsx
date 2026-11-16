import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { looksLikeCode } from '../lib/auth.js'

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

export function SignIn() {
  const { signIn, demo, googleReady, busy, error } = useAuth()
  if (demo) {
    return (
      <div className="panel center narrow">
        <h2>Welcome</h2>
        <p className="note">Sign in to open your dashboard. There is no password to remember.</p>
        <button className="gbtn" disabled title="Not available in the demo"><GoogleMark /> Sign in with Google</button>
        <button className="btn primary wide" onClick={signIn}>Demo Mode (skip sign in)</button>
        <div className="warn">
          <b>This is the demo.</b> Google sign-in is switched off here. Demo Mode opens the app with made-up sample data. You can change anything; nothing is saved or sent anywhere, and a reload resets it.
        </div>
      </div>
    )
  }
  return (
    <div className="panel center narrow">
      <h2>Welcome</h2>
      <p className="note">Sign in to open your dashboard. There is no password to remember.</p>
      <button className="gbtn" onClick={signIn} disabled={busy}><GoogleMark /> {busy ? 'Opening Google…' : 'Sign in with Google'}</button>
      {error && <p className="err" role="alert">{error}</p>}
      {googleReady ? (
        <div className="warn">
          <b>Only your name and email are read</b>, to show who is signed in. Nothing else is requested and nothing is kept. Your data file is still protected by its own passphrase.
        </div>
      ) : (
        <div className="warn">
          <b>Demo sign-in.</b> Google is not set up on this device yet (Account → Google connection), so this button signs you in as a demo user and sends nothing anywhere. Your data file is still protected by its own passphrase.
        </div>
      )}
    </div>
  )
}

// Built but not enforced: authentication is on hold, so this only appears when you turn the preview on.
export function MfaStep() {
  const { mfaPassed, mfaCancel } = useAuth()
  const [code, setCode] = useState('')
  return (
    <div className="panel center narrow">
      <div className="lock">🔐</div>
      <h2>Two-step verification</h2>
      <p className="note">Enter the 6-digit code from your authenticator app.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (looksLikeCode(code)) mfaPassed() }}>
        <input className="pw center-text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" aria-label="Verification code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
        <button className="btn primary wide" disabled={!looksLikeCode(code)}>Verify</button>
      </form>
      <div className="warn"><b>On hold.</b> The real verification step is not built yet, so any 6-digit code is accepted. This screen only shows where it will go.</div>
      <button className="link" onClick={mfaCancel}>Cancel</button>
    </div>
  )
}
