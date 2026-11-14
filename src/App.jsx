import { useEffect, useState } from 'react'
import { VaultProvider } from './finance/VaultContext.jsx'
import Finance from './finance/Finance.jsx'
import Property from './property/Property.jsx'
import Portfolio from './portfolio/Portfolio.jsx'
import { NavContext } from './nav.jsx'
import ClockWidget from './components/ClockWidget.jsx'

// Add future sections here: each entry becomes a top-level tab.
const TABS = [
  { id: 'home', label: 'Home', render: () => <div className="grid"><ClockWidget /></div> },
  { id: 'finance', label: 'Finance Dashboard', render: () => <Finance /> },
  { id: 'property', label: '🏠 Property', render: () => <Property /> },
  { id: 'portfolio', label: '📈 Portfolio', render: () => <Portfolio /> },
]

const read = (k, fallback) => {
  try { return localStorage.getItem(k) || fallback } catch { return fallback }
}
const write = (k, v) => {
  try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k) } catch { /* storage unavailable */ }
}

export default function App() {
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

  return (
    <VaultProvider>
      <NavContext.Provider value={nav}>
      <header className="topbar">
        <h1>My Dashboard</h1>
        <button className="btn" onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? 'Light mode' : 'Dark mode'}</button>
      </header>
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
