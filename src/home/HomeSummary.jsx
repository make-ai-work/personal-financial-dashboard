import Chart from '../finance/Chart.jsx'
import FxBar from '../finance/FxBar.jsx'
import { OwnerChip } from '../finance/ui.jsx'
import { COUNTRIES, OWNERS, moneyCurrency, money, ownerLabel } from '../lib/format.js'
import { combinedSeries, netWorth, ownerBreakdown } from '../lib/networth.js'

const fmtc = (cur, n) => (Number.isNaN(n) ? '—' : moneyCurrency(cur, n))

// Home, left column: country totals (in the first country's currency only), who owns what, and the combined history.
export function SummaryPanel({ data, owner, fx, parentLabel }) {
  const nw = netWorth(data, owner, fx)
  const ownerName = owner === 'all' ? 'All' : ownerLabel(owner, parentLabel)
  const multi = nw.per.length > 1
  return (
    <div className="card" aria-label="Summary">
      <h3 className="ch"><span>Summary · {ownerName}</span></h3>
      <div className="tblw">
        <table className="sumt">
          <thead><tr><th>Country</th><th>Assets</th><th>Liabilities</th><th>Net worth</th></tr></thead>
          <tbody>
            {nw.per.map((p) => (
              <tr key={p.code}>
                <td>{COUNTRIES[p.code].flag} {COUNTRIES[p.code].name} <span className="cur">{p.currency}</span></td>
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
      {multi && <FxBar fx={fx} />}
    </div>
  )
}

export function OwnershipPanel({ data, fx, parentLabel }) {
  const o = ownerBreakdown(data, fx)
  return (
    <div className="card" aria-label="By ownership">
      <h3 className="ch"><span>By ownership</span><span className="sub">net worth</span></h3>
      <div className="tblw">
        <table className="sumt">
          <thead><tr><th>Category</th><th>Net worth ({o.base})</th><th>Share</th></tr></thead>
          <tbody>
            {o.rows.map((r) => (
              <tr key={r.owner}><td><OwnerChip owner={r.owner} parentLabel={parentLabel} /></td><td>{fmtc(o.base, r.net)}</td><td>{r.share == null ? '—' : `${r.share.toFixed(0)}%`}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CombinedChartPanel({ data, owner, onOwner, fx, parentLabel }) {
  const nw = netWorth(data, owner, fx)
  const points = combinedSeries(data, owner, fx)
  const base = nw.base
  const first = data.settings.countries[0]
  return (
    <div className="card" aria-label="Net worth by month">
      <h3 className="ch"><span>Combined net worth by month <span className="cur">{base}</span></span><span className="sub">converted at today’s rate</span></h3>
      <div className="seg ownerseg" role="group" aria-label="Chart owner">
        {['all', ...OWNERS].map((o) => <button key={o} className={owner === o ? 'on' : ''} onClick={() => onOwner(o)}>{o === 'all' ? 'All' : ownerLabel(o, parentLabel)}</button>)}
      </div>
      {fx.ready || points.length ? (
        <Chart
          points={points}
          format={(n) => money(first, n)}
          compact={(n) => new Intl.NumberFormat(COUNTRIES[first].locale, { notation: 'compact', maximumFractionDigits: 2 }).format(n)}
          label="Net worth by month"
          lines={[{ key: 'net', label: 'Net worth', color: 'var(--accent)' }]}
        />
      ) : <div className="empty">Needs exchange rates. Press Refresh or set them manually.</div>}
    </div>
  )
}
