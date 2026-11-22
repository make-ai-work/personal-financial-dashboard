import { useState } from 'react'
import { validateClientId } from '../lib/google.js'
import { usePhone } from '../lib/usePhone.js'

const copy = async (text) => { try { await navigator.clipboard.writeText(text); return true } catch { return false } }

// The box, its checks and the "how do I get one" help, shown by Settings → Account → Use my own….
export function ClientIdForm({ initial = '', onSave, onReset, submitLabel = 'Save' }) {
  const phone = usePhone()
  const [value, setValue] = useState(initial)
  const [copied, setCopied] = useState(false)
  const v = validateClientId(value)
  const desktop = !!window.desktopApp // the Windows app signs in through your browser and a redirect address
  const origin = desktop ? `${window.location.origin}/oauth-callback` : window.location.origin
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
          <li><b>APIs &amp; Services › Library:</b> enable the <b>Google Drive API</b>. (Only needed if you choose to keep your encrypted file in Google Drive.)</li>
          <li><b>OAuth consent screen:</b> choose <i>External</i>, add yourself as a test user.</li>
          <li><b>Credentials › Create credentials › OAuth client ID</b>, type <b>Web application</b>.</li>
          <li>Under <b>{desktop ? 'Authorized redirect URIs' : 'Authorized JavaScript origins'}</b> add this address:
            <div className="copyrow"><code>{origin}</code><button type="button" className="btn sm" onClick={async () => { setCopied(await copy(origin)); setTimeout(() => setCopied(false), 1200) }}>{copied ? 'Copied' : 'Copy'}</button></div>
          </li>
          <li>Create it, then copy the <b>Client ID</b> (not the secret) into the box above.</li>
        </ol>
      </details>

      <div className="warn"><b>Never paste a client secret here.</b> This app does not need one. Only the client ID goes in the box.</div>
      <div className="kvs"><span>Permissions it will ask for</span><div>Signing in: your name and email only. Google Drive storage is optional: if you choose it, Google asks separately for access to the files this app creates in your Drive. It cannot see your other files.</div></div>
      <div className="rowend">
        {onReset ? <button type="button" className="link" onClick={onReset}>Go back to the app’s own Google sign-in</button> : <span />}
        <button className="btn primary" disabled={!v.ok}>{submitLabel}</button>
      </div>
    </form>
  )
}
