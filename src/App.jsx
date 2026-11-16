import { useEffect, useRef, useState } from 'react'
import { VaultProvider, useVault } from './finance/VaultContext.jsx'
import Finance from './finance/Finance.jsx'
import Property from './property/Property.jsx'
import Portfolio from './portfolio/Portfolio.jsx'
import Retirement from './retirement/Retirement.jsx'
import { NavContext } from './nav.jsx'
import Home from './home/Home.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { MfaStep, SignIn } from './auth/SignIn.jsx'
import { ClientIdForm, Setup } from './auth/Setup.jsx'
import { shortId } from './lib/google.js'
import { Modal, closeTopModal, hasOpenModal } from './finance/ui.jsx'
import { backAction, exitApp, onAppActive, onBackButton, shouldLockOnResume } from './lib/nativeapp.js'
import { PHASE } from './lib/auth.js'
import { APP_URL } from './lib/demo.js'

// Add future sections here: each entry becomes a top-level tab.
const TABS = [
  { id: 'home', label: 'Home', wide: true, render: () => <Home /> },
  { id: 'finance', label: 'Finance Dashboard', wide: true, render: () => <Finance /> },
  { id: 'property', label: '🏠 Property', render: () => <Property /> },
  { id: 'portfolio', label: '📈 Portfolio', render: () => <Portfolio /> },
  { id: 'retirement', label: '🏖️ Retirement', render: () => <Retirement /> },
]

const read = (k, fallback) => {
  try { return localStorage.getItem(k) || fallback } catch { return fallback }
}
const write = (k, v) => {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ }
}

// Who is signed in, two-step preview switch, and sign-out (which also locks the data file).
function Account() {
  const auth = useAuth()
  const vault = useVault()
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState(false)
  const signOut = async () => {
    if (vault.phase === 'unlocked') await vault.lock()
    auth.signOut()
  }
  return (
    <>
      <span className="who">
        <button className="btn" onClick={() => setOpen(true)} aria-label="Account"><span className="hide-sm">{auth.user.name}</span><span className="show-sm">Account</span></button>
      </span>
      {open && (
        <Modal title="Account" onClose={() => setOpen(false)} footer={<><button className="btn" onClick={() => setOpen(false)}>Close</button><button className="btn primary" onClick={signOut}>Sign out</button></>}>
          <p className="note">Signed in as <b>{auth.user.name}</b> ({auth.user.email}). {auth.real ? 'Signed in with your Google account. Your name and email are not stored: closing or reloading this page signs you out.' : 'This is a demo sign-in, not a real Google account.'}</p>
          <div className="acctrow">
            <div><b>Google connection</b><div className="hint">{auth.demo ? 'Not available in the demo' : auth.clientId ? <>Client ID <code>{shortId(auth.clientId)}</code></> : 'Not set up (demo sign-in)'}</div></div>
            <button className="btn sm" disabled={auth.demo} title={auth.demo ? 'Not available in the demo' : undefined} onClick={() => setEditId(true)}>{auth.clientId ? 'Change' : 'Set up'}</button>
          </div>
          <label className="check">
            <input type="checkbox" disabled={auth.demo} checked={auth.mfaRequired} onChange={(e) => auth.setMfaRequired(e.target.checked)} /> Preview the two-step verification screen at sign-in
          </label>
          <p className="note">Two-step verification is built into the sign-in flow but is on hold: nothing is enforced, and any 6-digit code passes.</p>
        </Modal>
      )}
      {editId && (
        <Modal title="Google connection" onClose={() => setEditId(false)}>
          <ClientIdForm initial={auth.clientId} submitLabel="Save" onSave={(id) => { if (auth.saveClientId(id)) { auth.endReview(); setEditId(false) } }} />
        </Modal>
      )}
    </>
  )
}

// Android app only: the Back button and locking after time away. Renders nothing.
function NativeBridge({ tab, setTab }) {
  const vault = useVault()
  const ref = useRef({ tab, vault })
  ref.current = { tab, vault }
  useEffect(() => {
    let offBack = () => {}
    let offState = () => {}
    let left = 0
    let dead = false
    onBackButton(() => {
      const action = backAction({ modalOpen: hasOpenModal(), tab: ref.current.tab })
      if (action === 'closeModal') closeTopModal()
      else if (action === 'home') setTab('home')
      else exitApp()
    }).then((off) => { if (dead) off?.(); else offBack = off || offBack })
    onAppActive((active) => {
      const v = ref.current.vault
      if (!active) { left = Date.now(); return }
      if (left && v.phase === 'unlocked' && shouldLockOnResume({ awayMs: Date.now() - left, autoLockMin: v.data?.settings?.autoLockMin })) v.lock()
      left = 0
    }).then((off) => { if (dead) off?.(); else offState = off || offState })
    return () => { dead = true; offBack(); offState() }
  }, [setTab])
  return null
}

// Shown on every screen of the demo site.
function DemoBar() {
  const vault = useVault()
  return (
    <div className="demobar" role="status">
      <span className="pill">DEMO</span>
      <span><b>Sample data.</b> <span className="hide-sm">Change anything you like: it stays in this browser tab and is gone when you reload. Nothing is saved or sent.</span></span>
      <span className="sp" />
      <button className="btn" onClick={() => vault.resetDemo()}>Reset sample data</button>
      <a className="btn primary" href={APP_URL} target="_blank" rel="noreferrer">Get the app</a>
    </div>
  )
}

function Shell() {
  const auth = useAuth()
  const [tab, setTab] = useState(() => read('tab', 'home'))
  const [theme, setTheme] = useState(() => read('theme', ''))
  const [focus, setFocus] = useState(null)
  const nav = { focus, clearFocus: () => setFocus(null), go: (id, params) => { setTab(id); setFocus(params || null) } }
  const current = TABS.find((t) => t.id === tab) || TABS[0]

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    write('theme', theme)
  }, [theme])
  useEffect(() => write('tab', tab), [tab])

  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  const ready = auth.phase === PHASE.ready

  const header = (acct) => (
    <header className="topbar">
      <h1>My Dashboard</h1>
      <span className="topbar-actions">
        <button className="btn" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? 'Light mode' : 'Dark mode'}><span className="hide-sm">{dark ? 'Light mode' : 'Dark mode'}</span><span className="show-sm">{dark ? '☀️' : '🌙'}</span></button>
        {acct}
      </span>
    </header>
  )

  if (!ready) {
    return (
      <>
        {header(null)}
        <main className="page">{auth.setup || auth.reviewing ? <Setup /> : auth.phase === PHASE.mfa ? <MfaStep /> : <SignIn />}</main>
      </>
    )
  }
  return (
    <VaultProvider>
      <NavContext.Provider value={nav}>
        {auth.demo && <DemoBar />}
        {auth.native && <NativeBridge tab={tab} setTab={setTab} />}
        {header(auth.native ? null : <Account />)}
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === current.id} className={t.id === current.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {current.wide ? <main className="wide-page">{current.render()}</main> : <main className="page">{current.render()}</main>}
      </NavContext.Provider>
    </VaultProvider>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
