import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'
import { ClientIdForm } from '../auth/Setup.jsx'
import { SavePanel } from '../finance/Gate.jsx'
import { ConfirmWipe } from '../finance/AppDialogs.jsx'
import AiSettings from '../ai/AiSettings.jsx'
import { useVault } from '../finance/VaultContext.jsx'
import FinanceSettings from '../finance/Settings.jsx'
import PropertySettings from '../property/PropertySettings.jsx'
import PortfolioSettings from '../portfolio/PortfolioSettings.jsx'
import HomeSettings from '../home/HomeSettings.jsx'
import { useNav } from '../nav.jsx'
import { homePrefs } from '../lib/homeprefs.js'
import { appModeAvailable, canPrompt, isStandalone, promptInstall, subscribe } from '../lib/pwa.js'

// Who is signed in (or that this is demo mode), signing in, where your data lives right after signing in from demo mode, and the Google
// connection. Nothing about who you are is stored.
function AccountSettings() {
  const auth = useAuth()
  const vault = useVault()
  const [editId, setEditId] = useState(false)
  const signOut = async () => {
    if (vault.phase === 'unlocked' && !vault.demo) await vault.lock()
    auth.signOut()
  }
  const carrying = auth.real && vault.demo // signed in from demo mode: choose where to keep your data (the demo changes go into it)
  return (
    <div className="panel" id="set-account">
      <div className="p-head"><div className="title">Account &amp; sign-in</div><button className="btn primary" onClick={signOut}>Sign out</button></div>
      <div className="pad">
        <p className="note" data-testid="who-note">{auth.real
          ? <>Signed in as <b>{auth.user.name}</b> ({auth.user.email}). Your name and email are not stored: closing the app ends the session.</>
          : <>You are in <b>demo mode</b> (Demo User) with sample data. Sign in with Google to keep your own data.</>}</p>
        {!auth.real && !auth.demoSite && auth.googleReady && (
          <div className="acctrow">
            <div><b>Sign in with Google</b><div className="hint">Then choose where to keep your data. Only your name and email are read.</div></div>
            <button className="btn sm primary" disabled={auth.busy} onClick={auth.signIn}>{auth.busy ? 'Opening Google…' : 'Sign in with Google'}</button>
          </div>
        )}
        {!auth.real && auth.demoSite && <p className="note">Google sign-in is not available in the demo.</p>}
        {auth.error && <p className="err" role="alert">{auth.error}</p>}
        {carrying && <div className="carry" data-testid="carry-panel"><SavePanel carry /></div>}
        {!auth.demoSite && (
          <>
            <div className="acctrow">
              <div><b>Google connection</b><div className="hint">{auth.usingDefault ? 'The app’s own Google sign-in' : 'Your own Google client'}</div></div>
              <span className="row-actions">
                <button className="btn sm" onClick={() => setEditId(!editId)}>{editId ? 'Cancel' : 'Use my own…'}</button>
              </span>
            </div>
            {editId && <ClientIdForm onSave={(id) => { if (auth.saveClientId(id)) setEditId(false) }} onReset={auth.usingDefault ? undefined : () => { auth.saveClientId(''); setEditId(false) }} />}
          </>
        )}
      </div>
    </div>
  )
}

// Danger zone: reset the vault and erase the data in its current storage.
function DangerZone() {
  const vault = useVault()
  const [dlg, setDlg] = useState(false)
  const where = vault.storage === 'drive' ? 'your Google Drive' : vault.storage === 'app' ? 'this app' : 'the vault file'
  return (
    <div className="panel danger-zone" id="set-danger">
      <div className="p-head"><div className="title">Danger zone</div></div>
      <div className="pad">
        {vault.demo ? <p className="note">Demo mode saves nothing, so there is nothing to wipe. Reload to start the sample data again.</p> : (
          <div className="row">
            <span>Wipe data<small>Resets the vault and erases all your data in {where}, then asks where to keep a new one. It cannot be undone, so export a backup first.</small></span>
            <button className="btn danger-btn" onClick={() => setDlg(true)}>Wipe data…</button>
          </div>
        )}
        {dlg && <ConfirmWipe where={where} onClose={() => setDlg(false)} onConfirm={async () => { await vault.wipe(); setDlg(false) }} />}
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
  { id: 'set-ai', label: 'AI assistant', needsData: false },
  { id: 'set-countries', label: 'Countries & display', needsData: true },
  { id: 'set-data', label: 'Data & security', needsData: true },
  { id: 'set-home', label: 'Home', needsData: false },
  { id: 'set-property', label: 'Property', needsData: true },
  { id: 'set-portfolio', label: 'Portfolio', needsData: true },
  { id: 'set-danger', label: 'Danger zone', needsData: false },
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
  const list = SECTIONS.filter((x) => x.id !== 'set-ai' || !auth.demoSite)
  return (
    <div className="wide-pad">
      <div className="split7030 settings">
        <div className="sp-l">
          <AccountSettings />
          {!auth.demoSite && <AiSettings />}
          {data ? (
            <>
              <FinanceSettings />
              <HomeSettings countries={countries} />
              <PropertySettings />
              <PortfolioSettings />
              <DangerZone />
            </>
          ) : (
            <>
              <HomeSettings countries={countries} />
              <div className="panel" id="set-locked">
                <div className="p-head"><div className="title">Data, countries, property and portfolio settings</div></div>
                <div className="pad"><p className="note">These are kept inside your encrypted data file, so they need it unlocked.</p>
                </div>
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
              <div className="row"><span>Version<small>{auth.native ? 'Android app' : window.desktopApp ? 'Windows app' : auth.demoSite ? 'Demo site' : 'Web app'}</small></span><span data-testid="app-version">{__APP_VERSION__}</span></div>
              <div className="row"><span>Your data<small>{vault.demo ? 'Sample data, nothing saved' : vault.storage === 'app' ? 'Vault file inside this app' : vault.storage === 'drive' ? 'Google Drive' : vault.fileName || 'Vault file you choose'}</small></span><span className="chip">{data ? 'Unlocked' : 'Locked'}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
