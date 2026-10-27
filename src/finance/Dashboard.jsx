import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import { COUNTRIES, OWNERS, ownerLabel } from '../lib/format.js'
import { useFx } from './useFx.js'
import Summary from './Summary.jsx'
import CountryView from './CountryView.jsx'
import Settings from './Settings.jsx'
import StatusBar from './StatusBar.jsx'

export default function Dashboard() {
  const v = useVault()
  const { data } = v
  const codes = data.settings.countries
  const [tab, setTab] = useState('summary')
  const [owner, setOwner] = useState('all')
  const [reveal, setReveal] = useState(false)
  const fx = useFx(codes, data.rates)
  const parentLabel = data.settings.parentLabel
  const active = [...codes, 'summary', 'settings'].includes(tab) ? tab : 'summary'

  return (
    <>
      <StatusBar />
      <nav className="subtabs">
        <button className={active === 'summary' ? 'on' : ''} onClick={() => setTab('summary')}>Summary</button>
        {codes.map((c) => (
          <button key={c} className={active === c ? 'on' : ''} onClick={() => setTab(c)}>{COUNTRIES[c].flag} {COUNTRIES[c].name}</button>
        ))}
        <button className={active === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>Settings</button>
      </nav>
      {active !== 'settings' && (
        <div className="filterbar">
          Show:
          <span className="seg" role="group" aria-label="Owner filter">
            {['all', ...OWNERS].map((o) => (
              <button key={o} className={owner === o ? 'on' : ''} onClick={() => setOwner(o)}>{o === 'all' ? 'All' : ownerLabel(o, parentLabel)}</button>
            ))}
          </span>
          <button className="btn sm" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide account numbers' : 'Show account numbers'}</button>
        </div>
      )}
      {active === 'summary' && <Summary owner={owner} fx={fx} />}
      {active === 'settings' && <Settings />}
      {codes.includes(active) && <CountryView key={active} code={active} owner={owner} reveal={reveal} fx={fx} />}
    </>
  )
}
