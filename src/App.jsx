import { useEffect, useState } from 'react'
import { VaultProvider, useVault } from './finance/VaultContext.jsx'
import Finance from './finance/Finance.jsx'
import Property from './property/Property.jsx'
import Portfolio from './portfolio/Portfolio.jsx'
import Retirement from './retirement/Retirement.jsx'
import { NavContext } from './nav.jsx'
import ClockWidget from './components/ClockWidget.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { MfaStep, SignIn } from './auth/SignIn.jsx'
import { Modal } from './finance/ui.jsx'
import { PHASE } from './lib/auth.js'

// Add future sections here: each entry becomes a top-level tab.
const TABS = [
  { id: 'home', label: 'Home', render: () => <div className="grid"><ClockWidget /></div> },
  { id: 'finance', label: 'Finance Dashboard', render: () => <Finance /> },
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
          <p className="note">Signed in as <b>{auth.user.name}</b> ({auth.user.email}). This is a demo sign-in, not a real Google account.</p>
          <label className="check">
            <input type="checkbox" checked={auth.mfaRequired} onChange={(e) => auth.setMfaRequired(e.target.checked)} /> Preview the two-step verification screen at sign-in
          </label>
          <p className="note">Two-step verification is built into the sign-in flow but is on hold: nothing is enforced, and any 6-digit code passes.</p>
        </Modal>
      )}
    </>
  )
}

function Shell() {
  const auth = useAuth()
  const [tab, setTab] = useState(() => read('tab', 'finance'))
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
        <main className="page">{auth.phase === PHASE.mfa ? <MfaStep /> : <SignIn />}</main>
      </>
    )
  }
  return (
    <VaultProvider>
      <NavContext.Provider value={nav}>
        {header(<Account />)}
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === current.id} className={t.id === current.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        <main className="page">{current.render()}</main>
      </NavContext.Provider>
    </VaultProvider>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
