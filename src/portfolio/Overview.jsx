import { useVault } from '../finance/VaultContext.jsx'
import FxBar from '../finance/FxBar.jsx'
import Allocation from './Allocation.jsx'
import { convert } from '../lib/model.js'
import { COUNTRIES, money, moneyCurrency, todayISO } from '../lib/format.js'
import { concentration, countryOf, holdingValue, holdingsOf, portfolioTotals, rebalance, staleHoldings } from '../lib/portfolio.js'

const VIEWS = [['class', 'Asset class'], ['geo', 'Geography'], ['ccy', 'Currency']]

export default function Overview({ fx, onOpenCountry }) {
  const { data } = useVault()
  const today = todayISO()
  const codes = data.settings.portfolioCountries
  const multi = codes.length > 1
  const { concentrationLimit: limit, rebalanceTol: tol, priceStaleDays: staleDays } = data.settings
  const cur = (c) => COUNTRIES[c].currency
  const base = codes[0]
  const shown = data.portfolios.filter((p) => codes.includes(countryOf(data, p)))
  const per = codes.map((c) => ({ c, t: portfolioTotals(data, shown.filter((p) => countryOf(data, p) === c)) }))
  const sumIn = (currency) => per.reduce((s, p) => s + convert(p.t.value, cur(p.c), currency, fx), 0)
  const fmtc = (currency, n) => (Number.isNaN(n) ? '—' : moneyCurrency(currency, n))

  // every holding re-expressed as a value-tracked holding in the reporting currency, for the combined allocation
  const converted = fx.ready ? shown.flatMap((p) => {
    const c = countryOf(data, p)
    return holdingsOf(data, p.id).map((h) => ({ ...h, trackBy: 'value', value: convert(holdingValue(h), cur(c), cur(base), fx), ccy: cur(c) }))
  }) : []

  const attention = []
  for (const p of shown) {
    const c = countryOf(data, p)
    if (!p.reconciled) attention.push({ k: `u-${p.id}`, c, text: <>Finish linking <b>{p.name}</b> to its Finance account.</> })
    const r = rebalance(p, holdingsOf(data, p.id), tol)
    if (r && !r.invalid && r.flagged) attention.push({ k: `r-${p.id}`, c, text: <><b>{p.name}</b> is off target: {r.rows.filter((x) => x.off).map((x) => `${x.label} ${x.drift >= 0 ? '+' : '−'}${Math.abs(x.drift).toFixed(1)} pts`).join(', ')} (tolerance ±{tol}).</> })
  }
  for (const x of concentration(data, shown, limit)) attention.push({ k: `c-${x.holding.id}`, c: countryOf(data, x.portfolio), text: <><b>{x.holding.name}</b> is {x.share.toFixed(1)}% of {x.portfolio.name} — above your {limit}% single-stock limit.</> })
  for (const x of staleHoldings(data, shown, today, staleDays)) attention.push({ k: `s-${x.holding.id}`, c: countryOf(data, shown.find((p) => p.id === x.holding.portfolioId)), text: <>The price of <b>{x.holding.name}</b> is {x.age} days old.</> })

  return (
    <div className="split7030">
      <div className="sp-l">
      <div className="panel">
        <div className="p-head"><div className="title">Portfolio summary</div></div>
        <div className="tblw"><table><thead><tr><th>Country</th><th>Portfolios</th><th>Holdings</th><th>Value</th></tr></thead><tbody>
          {per.map(({ c, t }) => (
            <tr key={c}><td><button className="link" onClick={() => onOpenCountry(c)}>{COUNTRIES[c].flag} {COUNTRIES[c].name}</button> <span className="cur">{cur(c)}</span></td><td>{t.count}</td><td>{t.holdings}</td><td>{money(c, t.value)}</td></tr>
          ))}
          {multi && codes.slice(0, 1).map((c) => (
            <tr key={`tot-${c}`} className="total"><td>Total in {cur(c)}</td><td>{per.reduce((s, p) => s + p.t.count, 0)}</td><td>{per.reduce((s, p) => s + p.t.holdings, 0)}</td><td>{fmtc(cur(c), sumIn(cur(c)))}</td></tr>
          ))}
        </tbody></table></div>
        {multi ? <FxBar fx={fx} note="These totals are already inside your Finance totals, through the linked accounts." /> : <div className="fx"><span>These totals are already inside your Finance totals, through the linked accounts.</span></div>}
      </div>
      </div>
      <aside className="sp-r">
      {converted.length > 0 && (
        <Allocation holdings={converted} names={{}} format={(n) => moneyCurrency(cur(base), n)} views={multi ? VIEWS : VIEWS.slice(0, 2)}
          title="Combined allocation" sub={multi ? `all countries, in ${cur(base)} at today's rate` : ''} />
      )}
      {!fx.ready && shown.length > 0 && <div className="panel"><div className="empty">The combined allocation needs exchange rates. Press Refresh above or set them manually.</div></div>}

      <div className="panel">
        <div className="p-head"><div className="title">Needs attention</div></div>
        {attention.length === 0 && <div className="okrow">Nothing needs attention.</div>}
        {attention.map((a) => (
          <div className="warnrow" key={a.k}>{COUNTRIES[a.c]?.flag} {a.text} <button className="link" onClick={() => onOpenCountry(a.c)}>Open</button></div>
        ))}
      </div>
      </aside>
    </div>
  )
}
