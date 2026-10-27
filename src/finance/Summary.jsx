import { useState } from 'react'
import { useVault } from './VaultContext.jsx'
import { byOwner, convert, inCountry, monthSeries, totals } from '../lib/model.js'
import { COUNTRIES, OWNERS, fmtDate, money, moneyCurrency, ownerLabel, todayISO } from '../lib/format.js'
import { OwnerChip } from './ui.jsx'
import Chart from './Chart.jsx'

function FxBar({ fx }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState('')
  const q = COUNTRIES[Object.keys(COUNTRIES).find((k) => COUNTRIES[k].currency === fx.quote)]
  return (
    <div className="fx">
      <span>
        Exchange rate:{' '}
        {fx.rate ? <b>1 {fx.base} = {q.symbol}{fx.rate.toLocaleString(q.locale, { maximumFractionDigits: 4 })}</b> : <b>unavailable</b>}
        {fx.source && <span className={`tag t-${fx.source}`}>{fx.source}</span>}
        {fx.at && fx.source === 'live' && ` fetched ${fx.at.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`}
        {fx.at && fx.source === 'saved' && ` from the update on ${fx.at.toLocaleDateString()}`}
        {fx.error && <span className="neg"> · live rate failed ({fx.error})</span>}
      </span>
      <span className="fx-actions">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); const r = Number(val); if (r > 0) { fx.setManual(r); setEditing(false) } }}>
            <input className="pw sm" inputMode="decimal" autoFocus placeholder={`1 ${fx.base} = ? ${fx.quote}`} value={val} onChange={(e) => setVal(e.target.value)} />
            <button className="btn">Use</button>
            <button type="button" className="btn" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        ) : (
          <>
            <button className="btn" onClick={fx.refresh} disabled={fx.loading}>{fx.loading ? 'Fetching…' : 'Refresh'}</button>
            <button className="btn" onClick={() => setEditing(true)}>Set manually</button>
          </>
        )}
      </span>
    </div>
  )
}

export default function Summary({ owner, fx }) {
  const { data } = useVault()
  const sel = data.settings.countries
  const parentLabel = data.settings.parentLabel
  const cur = (c) => COUNTRIES[c].currency
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

  // Combined history, converted at today's rate.
  const s1 = monthSeries(data, sel[0], owner)
  const s2 = monthSeries(data, sel[1], owner)
  const months = [...new Set([...s1, ...s2].map((p) => p.month))].sort()
  const at = (s, m) => s.find((p) => p.month === m)
  const points = fx.rate
    ? months.map((m) => {
        const a = at(s1, m)
        const b = at(s2, m)
        const net = (a ? a.net : 0) + (b ? cv(b.net, cur(sel[1]), cur(sel[0])) : 0)
        return { month: m, date: (a || b).date, net, carried: (!a || a.carried) && (!b || b.carried) }
      })
    : []
  const base = sel[0]
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
              {[cur(sel[0]), cur(sel[1])].map((currency) => (
                <tr key={currency} className="total">
                  <td>Total in {currency}</td>
                  <td>{fmtc(currency, sumIn(currency, 'assets'))}</td>
                  <td>{fmtc(currency, sumIn(currency, 'liabilities'))}</td>
                  <td>{fmtc(currency, sumIn(currency, 'net'))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <FxBar fx={fx} />
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">Combined net worth by month <span className="cur">{cur(base)}</span> <span className="sub">converted at today’s rate</span></div></div>
        {fx.rate || !months.length ? (
          <Chart
            points={points}
            format={(n) => money(base, n)}
            compact={(n) => new Intl.NumberFormat(COUNTRIES[base].locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)}
            label="Combined net worth by month"
            lines={[{ key: 'net', label: 'Combined net worth', color: 'var(--accent)' }]}
          />
        ) : <div className="empty">Needs an exchange rate. Press Refresh or set one manually.</div>}
      </div>

      <div className="panel">
        <div className="p-head"><div className="title">By ownership · net worth</div></div>
        <div className="tblw">
          <table>
            <thead><tr><th>Category</th><th>{COUNTRIES[sel[0]].name}</th><th>{COUNTRIES[sel[1]].name}</th><th>Combined ({cur(sel[0])})</th></tr></thead>
            <tbody>
              {OWNERS.map((o) => {
                const a = ownerNet(sel[0], o)
                const b = ownerNet(sel[1], o)
                return (
                  <tr key={o}>
                    <td><OwnerChip owner={o} parentLabel={parentLabel} /></td>
                    <td>{money(sel[0], a)}</td><td>{money(sel[1], b)}</td>
                    <td>{fmtc(cur(sel[0]), a + cv(b, cur(sel[1]), cur(sel[0])))}</td>
                  </tr>
                )
              })}
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
              <tr className="total">
                <td>Combined ({cur(sel[0])})</td><td>{policyRows[0].n + policyRows[1].n}</td>
                <td>{fmtc(cur(sel[0]), policyRows[0].benefit + cv(policyRows[1].benefit, cur(sel[1]), cur(sel[0])))}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
