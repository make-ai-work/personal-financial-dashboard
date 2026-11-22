import { useEffect, useRef, useState } from 'react'
import { VaultProvider, useVault } from './finance/VaultContext.jsx'
import Finance from './finance/Finance.jsx'
import Property from './property/Property.jsx'
import Portfolio from './portfolio/Portfolio.jsx'
import Retirement from './retirement/Retirement.jsx'
import { NavContext, useNav } from './nav.jsx'
import Home from './home/Home.jsx'
import { AuthProvider, useAuth } from './auth/AuthContext.jsx'
import { SignIn } from './auth/SignIn.jsx'
import { LandingGate } from './finance/Gate.jsx'
import SettingsPage from './settings/SettingsPage.jsx'
import { closeTopModal, hasOpenModal } from './finance/ui.jsx'
import { backAction, exitApp, onAppActive, onBackButton, shouldLockOnResume } from './lib/nativeapp.js'
import { PHASE } from './lib/auth.js'
import { APP_URL } from './lib/demo.js'

// Add future sections here: each entry becomes a top-level tab.
const TABS = [
  { id: 'home', label: 'Home', wide: true, render: () => <Home /> },
  { id: 'finance', label: '💲 Assets', name: 'Assets', wide: true, render: () => <Finance /> },
  { id: 'property', wide: true, label: '🏠 Property', render: () => <Property /> },
  { id: 'portfolio', wide: true, label: '📈 Portfolio', render: () => <Portfolio /> },
  { id: 'retirement', wide: true, label: '🏖️ Retirement', render: () => <Retirement /> },
  { id: 'settings', gear: true, wide: true, label: '⚙', name: 'Settings', render: () => <SettingsPage /> }, // the one place for every setting, far right
]

const read = (k, fallback) => {
  try { return localStorage.getItem(k) || fallback } catch { return fallback }
}
const write = (k, v) => {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ }
}

// The signed-in name in the top bar; it opens the Account part of the Settings tab.
function Account() {
  const auth = useAuth()
  const nav = useNav()
  return (
    <span className="who">
      <button className="btn" onClick={() => nav.go('settings', { section: 'account' })} aria-label="Account"><span className="hide-sm">{auth.user.name}</span><span className="show-sm">Account</span></button>
    </span>
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

// Shown on every screen while in demo mode (Demo User, sample data).
function DemoBar() {
  const vault = useVault()
  const auth = useAuth()
  if (!vault.demo) return null
  return (
    <div className="demobar" role="status">
      <span className="pill">DEMO MODE</span>
      <span><b>Sample data.</b> <span className="hide-sm">Change anything you like: it stays in this session and is gone when you reload. Nothing is saved or sent.</span></span>
      <span className="sp" />
      <button className="btn" onClick={() => vault.resetDemo()}>Reset sample data</button>
      {auth.demoSite && <a className="btn primary" href={APP_URL} target="_blank" rel="noreferrer">Get the app</a>}
    </div>
  )
}

function Shell() {
  const auth = useAuth()
  const [tab, setTab] = useState('home') // every sign-in lands on Home
  const [theme, setTheme] = useState(() => read('theme', ''))
  const [focus, setFocus] = useState(null)
  const nav = { focus, clearFocus: () => setFocus(null), go: (id, params) => { setTab(id); setFocus(params || null) } }
  const current = TABS.find((t) => t.id === tab) || TABS[0]

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme
    else delete document.documentElement.dataset.theme
    write('theme', theme)
  }, [theme])

  const dark = theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  const ready = auth.phase === PHASE.ready
  useEffect(() => { if (!ready) { setTab('home'); setFocus(null) } }, [ready]) // every sign-in lands on Home, whatever page you left from

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
        <main className="page"><SignIn /></main>
      </>
    )
  }
  return (
    <VaultProvider>
      <NavContext.Provider value={nav}>
        <LandingGate header={header(null)}>
        <DemoBar />
        {auth.native && <NativeBridge tab={tab} setTab={setTab} />}
        {header(auth.native ? null : <Account />)}
        <nav className="tabs" role="tablist">
          {TABS.filter((t) => !t.gear).map((t) => (
            <button key={t.id} role="tab" aria-selected={t.id === current.id} className={t.id === current.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
          <span className="tabsp" />
          {TABS.filter((t) => t.gear).map((t) => (
            <button key={t.id} role="tab" aria-label={t.name} title={t.name} aria-selected={t.id === current.id} className={`gear${t.id === current.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </nav>
        {current.wide ? <main className="wide-page">{current.render()}</main> : <main className="page">{current.render()}</main>}
        </LandingGate>
      </NavContext.Provider>
    </VaultProvider>
  )
}

export default function App() {
  return <AuthProvider><Shell /></AuthProvider>
}
