import { useState } from 'react'
import Heatmap from '../components/Heatmap.jsx'
import { useNav } from '../nav.jsx'
import { COUNTRIES, money, moneyCurrency, ownerLabel, curSym, todayISO } from '../lib/format.js'
import { convert } from '../lib/model.js'
import { allocation, countryOf, holdingValue, holdingsOf } from '../lib/portfolio.js'
import { combinedSeries, netWorth, ownerBreakdown } from '../lib/networth.js'
import { snapshot } from '../lib/property.js'
import { timeRemaining, describeMonths } from '../lib/amortization.js'
import { regularPayment } from '../property/PayoffCalculator.jsx'
import { planCurrency } from '../lib/retirement.js'

const SPLIT = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--green)', 'var(--red)']
export const Locked = ({ title }) => <div className="card"><h3 className="ch"><span>{title}</span></h3><p className="c">Unlock your data to see this.</p></div>

// ---- Total net worth, extra picture: the trend line over the saved months and the split by country ----
export function Sparkline({ points, format }) {
  if (points.length < 2) return <div className="empty">Save at least two updates on the Assets tab to see the trend.</div>
  const W = 520, H = 120, padX = 8, padT = 12, padB = 18
  const ys = points.map((p) => p.net)
  const lo = Math.min(...ys), hi = Math.max(...ys), span = hi - lo || 1
  const x = (i) => padX + (i / (points.length - 1)) * (W - 2 * padX)
  const y = (v) => padT + (1 - (v - lo) / span) * (H - padT - padB)
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ')
  const last = points.length - 1
  const lab = (p) => new Date(`${p.date}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Net worth by month, from ${format(points[0].net)} to ${format(points[last].net)}`} data-testid="sparkline">
      <defs><linearGradient id="spk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
      <g stroke="var(--line)" strokeWidth="1">{[0.25, 0.5, 0.75].map((f) => <line key={f} x1={padX} x2={W - padX} y1={padT + f * (H - padT - padB)} y2={padT + f * (H - padT - padB)} />)}</g>
      <polygon points={`${padX},${H - padB} ${line} ${x(last).toFixed(1)},${H - padB}`} fill="url(#spk)" />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last].net)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
      <g fill="var(--muted)" fontSize="11"><text x={padX} y={H - 3}>{lab(points[0])}</text><text x={W - padX} y={H - 3} textAnchor="end">{lab(points[last])}</text></g>
    </svg>
  )
}

export function NetWorthExtras({ data, owner, fx }) {
  const nw = netWorth(data, owner, fx)
  const pts = combinedSeries(data, owner, fx)
  const cur = nw.base
  const show = (n) => (Number.isNaN(n) ? '—' : moneyCurrency(cur, n))
  const lastP = pts[pts.length - 1]
  const yearAgo = lastP ? pts.find((p) => p.date >= new Date(new Date(`${lastP.date}T00:00:00`).setFullYear(new Date(`${lastP.date}T00:00:00`).getFullYear() - 1)).toISOString().slice(0, 10)) || pts[0] : null
  const diff = lastP && yearAgo && yearAgo !== lastP ? lastP.net - yearAgo.net : null
  const per = nw.ready ? nw.per.map((p) => ({ p, v: Math.max(0, p.inBase.net) })) : []
  const tot = per.reduce((s, x) => s + x.v, 0)
  return (
    <>
      {diff !== null && yearAgo.net !== 0 && <div className={diff >= 0 ? 'delta pos' : 'delta neg'} data-testid="nw-delta">{diff >= 0 ? '▲' : '▼'} {show(Math.abs(diff))} ({diff >= 0 ? '+' : '−'}{Math.abs((100 * diff) / Math.abs(yearAgo.net)).toFixed(1)}%) since {new Date(`${yearAgo.date}T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</div>}
      {fx.ready || pts.length ? <Sparkline points={pts} format={show} /> : null}
      {tot > 0 && per.length > 1 && (
        <div data-testid="nw-split">
          <div className="split" role="img" aria-label={per.map((x) => `${COUNTRIES[x.p.code].name} ${Math.round((100 * x.v) / tot)} percent`).join(', ')}>
            {per.map((x, i) => <i key={x.p.code} style={{ width: `${(100 * x.v) / tot}%`, background: SPLIT[i % SPLIT.length] }} />)}
          </div>
          <div className="hleg">{per.map((x, i) => <span key={x.p.code}><i className="sw" style={{ background: SPLIT[i % SPLIT.length] }} />{COUNTRIES[x.p.code].flag} {Math.round((100 * x.v) / tot)}%</span>)}</div>
        </div>
      )}
    </>
  )
}

// ---- Retirement at a glance: the chance of success of the saved plan you are on ----
function arc(f) { // a point on the half circle for a fraction 0..1 (left to right)
  const a = Math.PI * (1 - f)
  return [110 + 90 * Math.cos(a), 110 - 90 * Math.sin(a)]
}
export function RetirementTile({ data }) {
  const { go } = useNav()
  const r = data.retirement
  const onPlan = r.versions.find((x) => x.id === r.activeId) || null
  const v = onPlan || r.versions[0] || null // with edits not yet saved as a plan, the first saved plan is shown
  if (!v) {
    return (
      <div className="card" aria-label="Retirement at a glance" data-testid="retirement-tile">
        <h3 className="ch"><span>Retirement at a glance</span></h3>
        <p className="c">No saved plan yet. Open Retirement, set your numbers and save a plan to see your chance of success here.</p>
        <div><button className="btn primary" onClick={() => go('retirement')}>Open Retirement</button></div>
      </div>
    )
  }
  const succ = v.summary?.succ
  const target = (v.mc?.target ?? r.mc.target ?? 85) / 100
  const ok = succ >= target
  const cur = v.plan.currency || planCurrency(data)
  const f = Math.max(0, Math.min(1, succ || 0)), [ex, ey] = arc(f), [t1x, t1y] = arc(Math.max(0, target - 0.012)), [t2x, t2y] = arc(Math.min(1, target + 0.012))
  const [tx0, ty0] = [110 + 80 * Math.cos(Math.PI * (1 - target)), 110 - 80 * Math.sin(Math.PI * (1 - target))], [tx1, ty1] = [110 + 100 * Math.cos(Math.PI * (1 - target)), 110 - 100 * Math.sin(Math.PI * (1 - target))]
  return (
    <div className="card" aria-label="Retirement at a glance" data-testid="retirement-tile">
      <h3 className="ch"><span>Retirement at a glance</span><span className={`pill ${ok ? 'ok' : 'bad'}`}>{ok ? 'On track' : 'Off track'}</span></h3>
      <div className="gauge">
        <svg viewBox="0 0 220 128" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={`Chance of success ${Math.round(f * 100)} percent against a target of ${Math.round(target * 100)} percent`}>
          <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="var(--surface-2)" strokeWidth="16" strokeLinecap="round" />
          {f > 0 && <path d={`M20 110 A90 90 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke={ok ? 'var(--green)' : f >= target - 0.15 ? 'var(--amber)' : 'var(--red)'} strokeWidth="16" strokeLinecap="round" />}
          <line x1={tx0} y1={ty0} x2={tx1} y2={ty1} stroke="var(--text)" strokeWidth="2" />
          <text x="110" y="96" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--text)" data-testid="gauge-pct">{Math.round(f * 100)}%</text>
          <text x="110" y="116" textAnchor="middle" fontSize="11" fill="var(--muted)">chance your savings last to {v.plan.life}</text>
        </svg>
      </div>
      <div className="mini3">
        <div><small>Retire at</small><b>{v.plan.retAge}</b></div>
        <div><small>Years to go</small><b>{Math.max(0, v.plan.retAge - v.plan.age)}</b></div>
        <div><small>Plan</small><b>{v.name}</b></div>
        <div><small>Median at retirement</small><b>{moneyCurrency(cur, v.summary?.medRet || 0)}</b></div>
        <div><small>Target</small><b>{Math.round(target * 100)}%</b></div>
        <div><small>Spending / yr</small><b>{moneyCurrency(cur, v.plan.spend || 0)}</b></div>
      </div>
      {!onPlan && <div className="sub">Showing your saved plan “{v.name}”: the plan you are editing is not saved.</div>}
      <button className="link" onClick={() => go('retirement')}>Open Retirement →</button>
    </div>
  )
}

// ---- Portfolio heatmap: every holding as a block, sized by value, coloured by % of the total ----
const VIEWS = [['holding', 'Holding'], ['class', 'Class'], ['sector', 'Sector'], ['geo', 'Geography'], ['portfolio', 'Portfolio']]
export function PortfolioHeatTile({ data, fx }) {
  const { go } = useNav()
  const [by, setBy] = useState('holding')
  const codes = data.settings.countries
  const baseCur = COUNTRIES[codes[0]].currency
  const pfs = data.portfolios.filter((p) => codes.includes(countryOf(data, p)))
  const names = Object.fromEntries(pfs.map((p) => [p.id, p.name]))
  const converted = fx.ready || codes.length === 1 ? pfs.flatMap((p) => {
    const cur = COUNTRIES[countryOf(data, p)].currency
    return holdingsOf(data, p.id).map((h) => ({ ...h, trackBy: 'value', value: convert(holdingValue(h), cur, baseCur, fx) }))
  }).filter((h) => Number.isFinite(h.value) && h.value > 0) : []
  const items = by === 'holding'
    ? converted.map((h) => ({ key: h.id, label: h.ticker || h.name, value: h.value }))
    : allocation(converted, by, names).map((r) => ({ key: r.key, label: r.label, value: r.value }))
  return (
    <div className="card" aria-label="Portfolio heatmap" data-testid="portfolio-heat-tile">
      <h3 className="ch"><span>Portfolio heatmap</span><span className="sub">colour = % of total · {curSym(baseCur)}</span></h3>
      <div className="seg" role="group" aria-label="Heatmap view">{VIEWS.map(([k, l]) => <button key={k} className={by === k ? 'on' : ''} onClick={() => setBy(k)}>{l}</button>)}</div>
      {items.length ? <Heatmap items={items} ratio={1.5} label={`Portfolio by ${by}`} format={(n) => moneyCurrency(baseCur, n)} /> : <p className="c">No holdings yet. Add some on the Portfolio tab, or upload a file.</p>}
      <button className="link" onClick={() => go('portfolio')}>Open Portfolio →</button>
    </div>
  )
}

// ---- Properties: value, loan, equity and loan to value for each property ----
export function PropertiesTile({ data }) {
  const { go } = useNav()
  const today = todayISO()
  const codes = data.settings.countries
  const rows = data.properties.filter((p) => codes.includes(p.country)).map((p) => ({ p, s: snapshot(data, p, today) })).sort((a, b) => b.s.value - a.s.value)
  return (
    <div className="card" aria-label="Properties" data-testid="properties-tile">
      <h3 className="ch"><span>Properties</span><span className="sub">equity · loan to value</span></h3>
      {rows.length === 0 && <p className="c">No properties yet. Add one on the Property tab.</p>}
      {rows.slice(0, 5).map(({ p, s }) => {
        const loan = s.loans[0]?.loan
        const left = loan ? timeRemaining({ balance: s.loans[0].balance, ratePct: loan.rate, payment: regularPayment(loan), startDate: loan.startDate, termYears: loan.termYears }, today) : null
        return (
          <div className="pr" key={p.id} data-testid="property-row">
            <div className="row"><b>{COUNTRIES[p.country].flag} {p.name}</b><b className={s.equity >= 0 ? 'pos' : 'neg'}>{money(p.country, s.equity)} equity</b></div>
            <div className="row sub"><span>Value {money(p.country, s.value)}</span><span>Loan {money(p.country, s.balance)}</span></div>
            {s.ltv != null && <div className="bar" role="img" aria-label={`Loan to value ${Math.round(s.ltv * 100)} percent`}><i style={{ width: `${Math.min(100, s.ltv * 100)}%` }} /></div>}
            <div className="sub">{s.ltv != null ? `LTV ${Math.round(s.ltv * 100)}%` : 'No loan'}{left && left.months > 0 ? ` · ${describeMonths(left.months)} left` : ''}</div>
          </div>
        )
      })}
      {rows.length > 5 && <div className="sub">+ {rows.length - 5} more on the Property tab</div>}
      <button className="link" onClick={() => go('property')}>Open Property →</button>
    </div>
  )
}

// ---- Summary: the country table and, under it, who owns what as a heatmap ----
export function SummaryTile({ data, owner, fx, parentLabel }) {
  const nw = netWorth(data, owner, fx)
  const ownerName = owner === 'all' ? 'All' : ownerLabel(owner, parentLabel)
  const multi = nw.per.length > 1
  const fmtc = (cur, n) => (Number.isNaN(n) ? '—' : moneyCurrency(cur, n))
  const o = ownerBreakdown(data, fx)
  const items = o.rows.filter((r) => r.net > 0).map((r) => ({ key: r.owner, label: ownerLabel(r.owner, parentLabel), value: r.net }))
  return (
    <div className="card" aria-label="Summary">
      <h3 className="ch"><span>Summary · {ownerName}</span></h3>
      <div className="tblw">
        <table className="sumt">
          <thead><tr><th>Country</th><th>Assets</th><th>Liabilities</th><th>Net worth</th></tr></thead>
          <tbody>
            {nw.per.map((p) => (
              <tr key={p.code}>
                <td>{COUNTRIES[p.code].flag} {COUNTRIES[p.code].name} <span className="cur">{curSym(p.currency)}</span></td>
                <td>{money(p.code, p.assets)}</td><td className="neg">{money(p.code, p.liabilities)}</td><td className={p.net >= 0 ? 'pos' : 'neg'}>{money(p.code, p.net)}</td>
              </tr>
            ))}
            {multi && (
              <tr className="total" data-testid="summary-total">
                <td>Total in {nw.base}</td><td>{fmtc(nw.base, nw.total.assets)}</td><td>{fmtc(nw.base, nw.total.liabilities)}</td><td>{fmtc(nw.base, nw.total.net)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <h3 className="ch" style={{ marginTop: 4 }}><span>By ownership</span><span className="sub">colour = % of net worth</span></h3>
      {items.length ? <Heatmap items={items} ratio={2.6} label="Net worth by owner, as a heatmap" format={(n) => fmtc(o.base, n)} /> : <p className="c">Add accounts to see who owns what.</p>}
    </div>
  )
}
