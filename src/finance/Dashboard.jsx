import { useEffect, useState } from 'react'
import { useNav } from '../nav.jsx'
import { useVault } from './VaultContext.jsx'
import { COUNTRIES, OWNERS, ownerLabel } from '../lib/format.js'
import { useFx } from './useFx.js'
import CountryView from './CountryView.jsx'
import Settings from './Settings.jsx'
import StatusBar from './StatusBar.jsx'
import FxBar from './FxBar.jsx'

export default function Dashboard() {
  const v = useVault()
  const { data } = v
  const codes = data.settings.countries
  const [tab, setTab] = useState(codes[0])
  const [owner, setOwner] = useState('all')
  const [reveal, setReveal] = useState(false)
  const fx = useFx(codes, data.rates)
  const { focus, clearFocus } = useNav()
  useEffect(() => {
    if (focus?.country) {
      setTab(focus.country)
      clearFocus()
    }
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps
  const parentLabel = data.settings.parentLabel
  const active = [...codes, 'settings'].includes(tab) ? tab : codes[0]

  return (
    <div className="fin-page">
      <StatusBar />
      <nav className="subtabs">
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
      {active === 'settings' && <Settings />}
      {codes.length > 1 && active !== 'settings' && <div className="fin-fx"><FxBar fx={fx} /></div>}
      {codes.includes(active) && <CountryView key={active} code={active} owner={owner} reveal={reveal} fx={fx} />}
    </div>
  )
}
