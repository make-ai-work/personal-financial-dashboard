import { OwnerChip } from '../finance/ui.jsx'
import { fmtDate, money } from '../lib/format.js'
import { sourceLabel, typeIcon, typeLabel } from '../lib/property.js'
import { COUNTRIES } from '../lib/format.js'

// One row per property. `snap` is the result of snapshot() for it.
export default function PropertyList({ items, parentLabel, onOpen, showCountry }) {
  if (!items.length) return <div className="empty">No properties here yet.</div>
  return items.map(({ property: p, snap }) => {
    const fmt = (n) => money(p.country, n)
    return (
      <button key={p.id} className="pcard" onClick={() => onOpen(p.id)}>
        <div className="nm">{typeIcon(p.type)} {p.name}
          <span>{showCountry ? `${COUNTRIES[p.country].flag} ` : ''}{[p.address, typeLabel(p.type)].filter(Boolean).join(' · ')}</span></div>
        <div><small>Owner</small><OwnerChip owner={p.owner} parentLabel={parentLabel} /></div>
        <div><small>Value</small><b>{fmt(snap.value)}</b><br />
          {snap.valuation && <span className="src">{sourceLabel(snap.valuation.source)} · {fmtDate(snap.valuation.date).replace(/ \d{4}$/, '')}</span>}</div>
        <div><small>Mortgage</small><b className="neg">{fmt(snap.balance)}</b></div>
        <div><small>Equity · LTV</small><b className={snap.equity >= 0 ? 'pos' : 'neg'}>{fmt(snap.equity)}</b>{snap.ltv != null && <span className="sub"> {Math.round(snap.ltv * 100)}%</span>}
          {snap.ltv != null && <div className="ltv"><i style={{ width: `${Math.min(100, Math.round(snap.ltv * 100))}%` }} /></div>}</div>
      </button>
    )
  })
}
