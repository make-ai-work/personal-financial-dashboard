import { useVault } from './VaultContext.jsx'
import FxBar from './FxBar.jsx'
import Chart from './Chart.jsx'
import { OwnerChip } from './ui.jsx'
import { byOwner, convert, inCountry, monthSeries, totals } from '../lib/model.js'
import { COUNTRIES, OWNERS, fmtDate, money, moneyCurrency, ownerLabel, todayISO } from '../lib/format.js'

export default function Summary({ owner, fx }) {
  const { data } = useVault()
  const sel = data.settings.countries
  const multi = sel.length > 1
  const parentLabel = data.settings.parentLabel
  const cur = (c) => COUNTRIES[c].currency
  const base = sel[0]
  const cv = (n, from, to) => convert(n, from, to, fx)
  const fmtc = (currency, n) => (Number.isNaN(n) ? '—' : moneyCurrency(currency, n))

  const per = sel.map((c) => ({ c, t: totals(byOwner(inCountry(data.accounts, c), owner)) }))
  const sumIn = (currency, key) => per.reduce((s, p) => s + cv(p.t[key], cur(p.c), currency), 0)
  const ownerNet = (c, o) => totals(inCountry(data.accounts, c).filter((a) => a.owner === o)).net
  const today = todayISO()
  const policyRows = sel.map((c) => {
    const ps = byOwner(inCountry(data.policies, c), owner)
    const dates = ps.map((p) => p.maturityDate).filter(Boolean).sort()
    return { c, n: ps.length, benefit: ps.reduce((s, p) => s + (p.deathBenefit || 0), 0), next: dates.find((d) => d >= today) || dates[0] || '' }
  })
  const sumPolicies = policyRows.reduce((s, r) => s + cv(r.benefit, cur(r.c), cur(base)), 0)

  // Combined history in the reporting currency, converted at today's rate.
  const series = sel.map((c) => monthSeries(data, c, owner))
  const months = [...new Set(series.flat().map((p) => p.month))].sort()
  const points = fx.ready
    ? months.map((m) => {
        const hits = series.map((s) => s.find((p) => p.month === m))
        const net = hits.reduce((sum, h, i) => sum + (h ? cv(h.net, cur(sel[i]), cur(base)) : 0), 0)
        return { month: m, date: hits.find(Boolean).date, net, carried: hits.every((h) => !h || h.carried) }
      })
    : []
  const ownerName = owner === 'all' ? 'All' : ownerLabel(owner, parentLabel)

  return (
    <>
      <div className="panel">
        <div className="p-head"><div className="title">Summary · {ownerName}</div></div>
        <div className="tblw">
          <table>
            <thead><tr><th>Country</th><th>Assets</th><th>Liabilities</th><th>Net worth</th></tr></thead>
            <tbody>
              {per.map(({ c, t }) => (
                <tr key={c}>
                  <td>{COUNTRIES[c].flag} {COUNTRIES[c].name} <span className="cur">{cur(c)}</span></td>
                  <td>{money(c, t.assets)}</td><td className="neg">{money(c, t.liabilities)}</td><td className={t.net >= 0 ? 'pos' : 'neg'}>{money(c, t.net)}</td>
                </tr>
              ))}
              {multi && sel.map((c) => (
                <tr key={`tot-${c}`} className="total">
                  <td>Total in {cur(c)}</td>
                  <td>{fmtc(cur(c), sumIn(cur(c), 'assets'))}</td>
                  <td>{fmtc(cur(c), sumIn(cur(c), 'liabilities'))}</td>
                  <td>{fmtc(cur(c), sumIn(cur(c), 'net'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {multi && <FxBar fx={fx} />}
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">{multi ? 'Combined net worth by month' : 'Net worth by month'} <span className="cur">{cur(base)}</span>{multi && <span className="sub">converted at today’s rate</span>}</div></div>
        {fx.ready || !months.length ? (
          <Chart
            points={points}
            format={(n) => money(base, n)}
            compact={(n) => new Intl.NumberFormat(COUNTRIES[base].locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)}
            label="Net worth by month"
            lines={[{ key: 'net', label: multi ? 'Combined net worth' : 'Net worth', color: 'var(--accent)' }]}
          />
        ) : <div className="empty">Needs exchange rates. Press Refresh or set them manually.</div>}
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">By ownership · net worth</div></div>
        <div className="tblw">
          <table>
            <thead><tr><th>Category</th>{sel.map((c) => <th key={c}>{COUNTRIES[c].name}</th>)}{multi && <th>Combined ({cur(base)})</th>}</tr></thead>
            <tbody>
              {OWNERS.map((o) => (
                <tr key={o}>
                  <td><OwnerChip owner={o} parentLabel={parentLabel} /></td>
                  {sel.map((c) => <td key={c}>{money(c, ownerNet(c, o))}</td>)}
                  {multi && <td>{fmtc(cur(base), sel.reduce((s, c) => s + cv(ownerNet(c, o), cur(c), cur(base)), 0))}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Insurance <span className="sub">not counted in net worth</span></div></div>
        <div className="tblw">
          <table>
            <thead><tr><th>Country</th><th>Policies</th><th>Total death benefit</th><th>Next maturity</th></tr></thead>
            <tbody>
              {policyRows.map((r) => (
                <tr key={r.c}><td>{COUNTRIES[r.c].flag} {COUNTRIES[r.c].name}</td><td>{r.n}</td><td>{money(r.c, r.benefit)}</td><td>{fmtDate(r.next)}</td></tr>
              ))}
              {multi && (
                <tr className="total">
                  <td>Combined ({cur(base)})</td><td>{policyRows.reduce((s, r) => s + r.n, 0)}</td><td>{fmtc(cur(base), sumPolicies)}</td><td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
