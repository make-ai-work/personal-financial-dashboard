import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import StatusBar from '../finance/StatusBar.jsx'
import { useFx } from '../finance/useFx.js'
import { PropertyModal } from './PropertyForms.jsx'
import Overview from './Overview.jsx'
import CountryProperties from './CountryProperties.jsx'
import PropertyPage from './PropertyPage.jsx'
import { COUNTRIES, OWNERS, ownerLabel, todayISO } from '../lib/format.js'
import { addProperty } from '../lib/property.js'

export default function PropertyApp() {
  const { data, update } = useVault()
  const codes = data.settings.countries
  const fx = useFx(codes, data.rates)
  const [tab, setTab] = useState('overview')
  const [openId, setOpenId] = useState(null)
  const [owner, setOwner] = useState('all')
  const [reveal, setReveal] = useState(false)
  const [adding, setAdding] = useState(null) // country code to preselect
  const parentLabel = data.settings.parentLabel
  const property = openId && data.properties.find((p) => p.id === openId)
  const active = [...codes, 'overview'].includes(tab) ? tab : 'overview'
  const goto = (t) => { setTab(t); setOpenId(null) }

  return (
    <div className="wide-pad">
      <StatusBar />
      <nav className="subtabs">
        <button className={!property && active === 'overview' ? 'on' : ''} onClick={() => goto('overview')}>Overview</button>
        {codes.map((c) => <button key={c} className={active === c ? 'on' : ''} onClick={() => goto(c)}>{COUNTRIES[c].flag} {COUNTRIES[c].name}</button>)}
        <button onClick={() => setAdding(codes.includes(active) ? active : codes[0])}>+ Add property</button>
      </nav>
      {(
        <div className="filterbar">
          {property && <button className="link" onClick={() => setOpenId(null)}>← Back</button>}
          Show:
          <span className="seg" role="group" aria-label="Owner filter">
            {['all', ...OWNERS].map((o) => <button key={o} className={owner === o ? 'on' : ''} onClick={() => setOwner(o)}>{o === 'all' ? 'All' : ownerLabel(o, parentLabel)}</button>)}
          </span>
          <button className="btn sm" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide loan numbers' : 'Show loan numbers'}</button>
        </div>
      )}
      <div className="subpage" style={{ paddingTop: 0 }}>
        {property ? <PropertyPage key={property.id} property={property} reveal={reveal} onDeleted={() => setOpenId(null)} />
          : active === 'overview' ? <Overview owner={owner} fx={fx} onOpen={setOpenId} />
          : <CountryProperties code={active} owner={owner} onOpen={setOpenId} onAdd={setAdding} />}
      </div>
      {adding && (
        <PropertyModal countries={codes} parentLabel={parentLabel} initial={{ country: adding }} onClose={() => setAdding(null)}
          onSave={(p, currentValue) => {
            const { country, ...rest } = p
            const id = crypto.randomUUID()
            update((d) => addProperty(d, { id, country, ...rest }, { currentValue, today: todayISO() }))
            setAdding(null)
            setTab(country)
            setOpenId(id)
          }} />
      )}
    </div>
  )
}
