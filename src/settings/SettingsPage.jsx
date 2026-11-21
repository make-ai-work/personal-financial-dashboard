import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { ClientIdForm } from '../auth/Setup.jsx'
import { useVault } from '../finance/VaultContext.jsx'
import FinanceSettings from '../finance/Settings.jsx'
import PropertySettings from '../property/PropertySettings.jsx'
import PortfolioSettings from '../portfolio/PortfolioSettings.jsx'
import HomeSettings from '../home/HomeSettings.jsx'
import { useNav } from '../nav.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { shortId } from '../lib/google.js'
import { appModeAvailable, canPrompt, isStandalone, promptInstall, subscribe } from '../lib/pwa.js'

// Who is signed in, the Google connection, the two-step preview, and sign-out (which also locks the data file).
function AccountSettings() {
  const auth = useAuth()
  const vault = useVault()
  const [editId, setEditId] = useState(false)
  const signOut = async () => {
    if (vault.phase === 'unlocked') await vault.lock()
    auth.signOut()
  }
  return (
    <div className="panel" id="set-account">
      <div className="p-head"><div className="title">Account &amp; sign-in</div>{!auth.native || auth.real ? <button className="btn primary" onClick={signOut}>Sign out</button> : null}</div>
      <div className="pad">
        <p className="note" data-testid="who-note">{auth.real
          ? <>Signed in as <b>{auth.user.name}</b> ({auth.user.email}). Your name and email are not stored: closing the app ends the session.</>
          : <>You are <b>not signed in</b>, which is fine: signing in is optional and only shows who you are. Your data is protected by its own passphrase either way.</>}</p>
        {!auth.real && auth.googleReady && !auth.demo && (
          <div className="acctrow">
            <div><b>Sign in with Google</b><div className="hint">Optional. Only your name and email are read.</div></div>
            <button className="btn sm primary" disabled={auth.busy} onClick={auth.signIn}>{auth.busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          </div>
        )}
        {auth.error && <p className="err" role="alert">{auth.error}</p>}
        <div className="acctrow">
          <div><b>Google connection</b><div className="hint">{auth.demo ? 'Not available in the demo' : auth.usingDefault ? <>Built-in Google client <code>{shortId(auth.clientId)}</code></> : auth.clientId ? <>Your own client ID <code>{shortId(auth.clientId)}</code></> : 'Not set up'}</div></div>
          <span className="row-actions">
            <button className="btn sm" disabled={auth.demo} title={auth.demo ? 'Not available in the demo' : undefined} onClick={() => setEditId(!editId)}>{editId ? 'Cancel' : auth.usingDefault ? 'Use my own…' : auth.clientId ? 'Change' : 'Set up'}</button>
            {auth.hasBuiltIn && !auth.usingDefault && <button className="btn sm" onClick={auth.useBuiltIn}>Use the built-in one</button>}
            {auth.clientId && <button className="btn sm" onClick={auth.turnOffGoogle} title="Stop using Google sign-in and Drive on this device">Turn off Google</button>}
          </span>
        </div>
        {editId && <ClientIdForm initial={auth.clientId} submitLabel="Save" onSave={(id) => { if (auth.saveClientId(id)) { auth.endReview(); setEditId(false) } }} />}
        <label className="check">
          <input type="checkbox" disabled={auth.demo} checked={auth.mfaRequired} onChange={(e) => auth.setMfaRequired(e.target.checked)} /> Preview the two-step verification screen at sign-in
        </label>
        <p className="note">Two-step verification is built into the sign-in flow but is on hold: nothing is enforced, and any 6-digit code passes.</p>
      </div>
    </div>
  )
}

// "Run as an app" (web version): install it so it has its own window, a Start-menu / taskbar icon and opens even offline.
function RunAsApp() {
  const [, tick] = useState(0)
  const [answer, setAnswer] = useState('')
  useEffect(() => subscribe(() => tick((n) => n + 1)), [])
  if (!appModeAvailable()) return null
  if (isStandalone()) return <div className="row" data-testid="run-as-app"><span>Run as an app<small>This window is the installed app.</small></span><span className="chip">Installed</span></div>
  return (
    <div className="row" data-testid="run-as-app">
      <span>Run as an app<small>{canPrompt() ? 'Gives it its own window, a Start-menu and taskbar icon, and it opens even without a connection.' : 'In Edge or Chrome: the install icon in the address bar, or menu → Apps → Install this site as an app.'}{answer === 'dismissed' ? ' (You chose not to install. The browser menu still has it.)' : ''}</small></span>
      {canPrompt() && <button className="btn primary" onClick={async () => setAnswer(await promptInstall())}>Install as app</button>}
    </div>
  )
}

const SECTIONS = [
  { id: 'set-account', label: 'Account & sign-in', needsData: false },
  { id: 'set-countries', label: 'Countries & display', needsData: true },
  { id: 'set-data', label: 'Data & security', needsData: true },
  { id: 'set-home', label: 'Home', needsData: false },
  { id: 'set-property', label: 'Property', needsData: true },
  { id: 'set-portfolio', label: 'Portfolio', needsData: true },
]

// The one Settings tab (gear icon, far right), 70 : 30: every setting on the left, an index and this device's details on the right.
export default function SettingsPage() {
  const auth = useAuth()
  const vault = useVault()
  const nav = useNav()
  const data = vault.data
  const [active, setActive] = useState('set-account')
  const wanted = useRef(nav.focus?.section ? `set-${nav.focus.section}` : null)

  const goTo = (id) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  useEffect(() => {
    if (nav.focus?.section) nav.clearFocus()
    if (wanted.current) { const id = wanted.current; wanted.current = null; setTimeout(() => goTo(id), 60) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const countries = data?.settings?.countries?.length ? data.settings.countries : homePrefs.countries()
  const list = SECTIONS
  return (
    <div className="wide-pad">
      <div className="split7030 settings">
        <div className="sp-l">
          <AccountSettings />
          {data ? (
            <>
              <FinanceSettings />
              <HomeSettings countries={countries} />
              <PropertySettings />
              <PortfolioSettings />
            </>
          ) : (
            <>
              <HomeSettings countries={countries} />
              <div className="panel" id="set-locked">
                <div className="p-head"><div className="title">Data, countries, property and portfolio settings</div></div>
                <div className="pad"><p className="note">These are kept inside your encrypted data file, so they need it unlocked.</p>
                  <button className="btn primary" onClick={() => nav.go('finance')}>Unlock on the Finance tab</button></div>
              </div>
            </>
          )}
        </div>
        <aside className="sp-r">
          <div className="panel">
            <div className="p-head"><div className="title">On this page</div></div>
            <nav className="idx" aria-label="Settings sections">
              {list.filter((s) => data || !s.needsData).map((s) => (
                <button key={s.id} className={active === s.id ? 'on' : ''} onClick={() => goTo(s.id)}>{s.label}</button>
              ))}
            </nav>
          </div>
          <div className="panel">
            <div className="p-head"><div className="title">This device</div></div>
            <div className="pad">
              <RunAsApp />
              <div className="row"><span>Version<small>{auth.native ? 'Android app' : window.desktopApp ? 'Windows app' : auth.demo ? 'Demo site' : 'Web app'}</small></span><span>0.1.0</span></div>
              <div className="row"><span>Your data<small>{vault.demo ? 'Sample data, nothing saved' : vault.storage === 'app' ? 'Vault file inside this app' : vault.storage === 'drive' ? 'Google Drive' : vault.fileName || 'Vault file you choose'}</small></span><span className="chip">{data ? 'Unlocked' : 'Locked'}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
