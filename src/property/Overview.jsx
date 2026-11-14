import { useVault } from '../finance/VaultContext.jsx'
import FxBar from '../finance/FxBar.jsx'
import StatusChip from '../components/StatusChip.jsx'
import PropertyList from './PropertyList.jsx'
import { byOwner, convert } from '../lib/model.js'
import { COUNTRIES, moneyCurrency, money, todayISO } from '../lib/format.js'
import { dueItems, snapshot, totalsFor } from '../lib/property.js'

const WINDOW_DAYS = 90

export default function Overview({ owner, fx, onOpen }) {
  const { data } = useVault()
  const today = todayISO()
  const codes = data.settings.propertyCountries
  const multi = codes.length > 1
  const cur = (c) => COUNTRIES[c].currency
  const visible = byOwner(data.properties.filter((p) => codes.includes(p.country)), owner)
  const per = codes.map((c) => ({ c, t: totalsFor(data, visible.filter((p) => p.country === c), today) }))
  const sumIn = (currency, key) => per.reduce((s, p) => s + convert(p.t[key], cur(p.c), currency, fx), 0)
  const fmtc = (currency, n) => (Number.isNaN(n) ? '—' : moneyCurrency(currency, n))
  const rows = visible.map((p) => ({ property: p, snap: snapshot(data, p, today) })).sort((a, b) => b.snap.value - a.snap.value)
  const due = dueItems(data, today, data.settings.dueSoonDays, visible).filter((i) => i.days <= WINDOW_DAYS)

  return (
    <>
      <div className="panel">
        <div className="p-head"><div className="title">Property summary</div></div>
        <div className="tblw"><table><thead><tr><th>Country</th><th>Properties</th><th>Value</th><th>Mortgage balance</th><th>Equity</th></tr></thead><tbody>
          {per.map(({ c, t }) => (
            <tr key={c}><td>{COUNTRIES[c].flag} {COUNTRIES[c].name} <span className="cur">{cur(c)}</span></td><td>{t.count}</td><td>{money(c, t.value)}</td><td className="neg">{money(c, t.balance)}</td><td className={t.equity >= 0 ? 'pos' : 'neg'}>{money(c, t.equity)}</td></tr>
          ))}
          {multi && codes.map((c) => (
            <tr key={`tot-${c}`} className="total">
              <td>Total in {cur(c)}</td><td>{per.reduce((s, p) => s + p.t.count, 0)}</td>
              <td>{fmtc(cur(c), sumIn(cur(c), 'value'))}</td><td>{fmtc(cur(c), sumIn(cur(c), 'balance'))}</td><td>{fmtc(cur(c), sumIn(cur(c), 'equity'))}</td>
            </tr>
          ))}
        </tbody></table></div>
        {multi ? <FxBar fx={fx} note="Property is not counted in the Finance Dashboard totals." /> : <div className="fx"><span>Property is not counted in the Finance Dashboard totals.</span></div>}
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">All properties</div></div>
        <PropertyList items={rows} parentLabel={data.settings.parentLabel} onOpen={onOpen} showCountry />
      </div>

      {due.length > 0 && (
        <div className="panel">
          <div className="p-head"><div className="title">Coming up <span className="sub">next {WINDOW_DAYS} days</span></div></div>
          {due.map((i) => (
            <div className="rem" key={i.id}><span>{i.label}<small>{i.sub}</small></span><StatusChip status={i.status} text={i.text} /></div>
          ))}
        </div>
      )}
    </>
  )
}
