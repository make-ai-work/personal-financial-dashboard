import { useState } from 'react'
import { useAuth } from './AuthContext.jsx'
import { validateClientId } from '../lib/google.js'
import { usePhone } from '../lib/usePhone.js'

const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true } catch { return false } }

// The box, its checks and the "how do I get one" help. Used on the first-run screen and in the Account dialog.
export function ClientIdForm({ initial = '', onSave, onSkip, submitLabel = 'Save and continue' }) {
  const phone = usePhone()
  const [value, setValue] = useState(initial)
  const [copied, setCopied] = useState(false)
  const v = validateClientId(value)
  const origin = window.location.origin
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (v.ok) onSave(value.trim()) }}>
      <label className="field">OAuth client ID
        <input className={`mono-in${v.error ? ' bad' : v.ok ? ' good' : ''}`} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" spellCheck="false" placeholder="1234567890-abcdefg.apps.googleusercontent.com" aria-label="OAuth client ID" />
      </label>
      <div className="hint">It ends in <code>.apps.googleusercontent.com</code>.</div>
      {v.error && <div className="err" role="alert">{v.error}</div>}
      {v.ok && <div className="okmsg">Looks right.</div>}

      <details className="howto" open={!phone}>
        <summary>How do I get one? (about 5 minutes)</summary>
        <ol>
          <li>Open <b>Google Cloud Console</b> and create a project (any name).</li>
          <li><b>APIs &amp; Services › Library:</b> enable the <b>Google Drive API</b>.</li>
          <li><b>OAuth consent screen:</b> choose <i>External</i>, add yourself as a test user.</li>
          <li><b>Credentials › Create credentials › OAuth client ID</b>, type <b>Web application</b>.</li>
          <li>Under <b>Authorized JavaScript origins</b> add this address:
            <div className="copyrow"><code>{origin}</code><button type="button" className="btn sm" onClick={async () => { setCopied(await copy(origin)); setTimeout(() => setCopied(false), 1200) }}>{copied ? 'Copied' : 'Copy'}</button></div>
          </li>
          <li>Create it, then copy the <b>Client ID</b> (not the secret) into the box above.</li>
        </ol>
      </details>

      <div className="warn"><b>Never paste a client secret here.</b> This app does not need one. Only the client ID goes in the box.</div>
      <div className="kvs"><span>Permissions it will ask for</span><div>Your name and email (to sign you in), and access only to the files this app creates in your Drive. It cannot see your other files.</div></div>
      <div className="rowend">
        {onSkip ? <button type="button" className="link" onClick={onSkip}>Skip for now, use the demo sign-in</button> : <span />}
        <button className="btn primary" disabled={!v.ok}>{submitLabel}</button>
      </div>
    </form>
  )
}

// First-run screen shown before sign-in until a client ID is saved or setup is skipped.
export function Setup() {
  const auth = useAuth()
  const [editing, setEditing] = useState(false)
  if (auth.reviewing && !editing) return <SavedCard onContinue={auth.endReview} onChange={() => setEditing(true)} />
  return (
    <div className="panel center">
      <div className="steps"><b>Setup</b> › Sign in › Open your data</div>
      <h2>Connect your Google account</h2>
      <p className="note">Sign in with Google and saving to Google Drive need a free “client ID” from Google. You only do this once; it is not a password and it is not secret.</p>
      <ClientIdForm initial={editing ? auth.clientId : ''} onSave={(id) => { if (auth.saveClientId(id)) setEditing(false) }} onSkip={editing ? undefined : auth.skipSetup} />
    </div>
  )
}

export function SavedCard({ onContinue, onChange }) {
  const auth = useAuth()
  return (
    <div className="panel center">
      <div className="steps">Setup ✓ › <b>Sign in</b> › Open your data</div>
      <h2>Google is set up</h2>
      <div className="okbox">Client ID saved in this browser. <span className="pill p-wait">sign-in on hold</span></div>
      <div className="kvs"><span>Client ID</span><code>{auth.clientId}</code><span>This address</span><code>{window.location.origin}</code><span>Drive access</span><div>App files only</div></div>
      <p className="note" style={{ textAlign: 'left' }}>Real Google sign-in is not switched on yet, so the next screen still uses the demo button. Nothing is sent to Google.</p>
      <div className="rowend"><button className="link" onClick={onChange}>Change client ID</button><button className="btn primary" onClick={onContinue}>Continue to sign in</button></div>
    </div>
  )
}
