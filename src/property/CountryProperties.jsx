import { useVault } from '../finance/VaultContext.jsx'
import Chart from '../finance/Chart.jsx'
import PropertyList from './PropertyList.jsx'
import { byOwner } from '../lib/model.js'
import { COUNTRIES, money, ownerLabel, todayISO, curSym } from '../lib/format.js'
import { history, snapshot, totalsFor } from '../lib/property.js'

export default function CountryProperties({ code, owner, onOpen, onAdd }) {
  const { data } = useVault()
  const today = todayISO()
  const c = COUNTRIES[code]
  const props = byOwner(data.properties.filter((p) => p.country === code), owner)
  const t = totalsFor(data, props, today)
  const rows = props.map((p) => ({ property: p, snap: snapshot(data, p, today) })).sort((a, b) => b.snap.value - a.snap.value)
  const points = history(data, props, today)
  const fmt = (n) => money(code, n)
  const ownerName = owner === 'all' ? 'All' : ownerLabel(owner, data.settings.parentLabel)

  return (
    <div className="split7030">
      <div className="sp-l">
      <div className="panel">
        <div className="p-head"><div className="title">{c.flag} {c.name} <span className="cur">{curSym(c.currency)}</span> <span className="sub">{ownerName}</span></div><button className="btn primary" onClick={() => onAdd(code)}>+ Add property</button></div>
        <div className="kpis four">
          <div className="kpi"><small>Total value</small><b>{fmt(t.value)}</b></div>
          <div className="kpi"><small>Mortgages</small><b className="neg">{fmt(t.balance)}</b></div>
          <div className="kpi"><small>Equity</small><b className={t.equity >= 0 ? 'pos' : 'neg'}>{fmt(t.equity)}</b></div>
          <div className="kpi"><small>Monthly payments</small><b>{fmt(t.monthly)}</b></div>
        </div>
        <PropertyList items={rows} parentLabel={data.settings.parentLabel} onOpen={onOpen} />
      </div>
      </div>
      <aside className="sp-r">
      <div className="panel">
        <div className="p-head"><div className="title">Equity by month <span className="sub">value − mortgage balance</span></div></div>
        <Chart points={points} lines={[{ key: 'equity', label: 'Equity', color: 'var(--accent)' }]} format={fmt}
          compact={(n) => new Intl.NumberFormat(c.locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)}
          label={`${c.flag} ${c.name} equity by month`} note="Monthly. Filled dot = a valuation or loan record that month; hollow = carried forward." />
      </div>
      </aside>
    </div>
  )
}
