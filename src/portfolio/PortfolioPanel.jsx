import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { COUNTRIES, fmtDate, money, todayISO } from '../lib/format.js'
import { finishLinking, holdingValue, holdingsOf, linkStatus, priceAge, removeHolding, removePortfolio, typeLabel } from '../lib/portfolio.js'
import { useNav } from '../nav.jsx'

function ReconcileBanner({ portfolio, country, hasHoldings }) {
  const { data, update } = useVault()
  const [mode, setMode] = useState('unallocated') // the default the user asked for
  const st = linkStatus(data, portfolio.id)
  const fmt = (n) => money(country, n)
  const finish = () => update((d) => finishLinking(d, portfolio.id, mode, todayISO()))
  return (
    <div className="reconcile" role="region" aria-label="Finish linking">
      <b>Finish linking to Finance.</b> Until you do, the Finance account keeps the balance you typed ({fmt(st.account)}).
      <div className="recon-grid">
        <span>Holdings total</span><b>{fmt(st.holdings)}</b>
        <span>Finance account says</span><b>{fmt(st.account)}</b>
        <span>Difference</span><b className={st.matches ? 'pos' : 'neg'}>{st.matches ? 'none — they match' : `${st.diff > 0 ? '' : '+ '}${fmt(Math.abs(st.diff))} ${st.diff > 0 ? 'unexplained' : 'more in holdings'}`}</b>
      </div>
      {st.canAddUnallocated && (
        <div className="radios stack" role="radiogroup" aria-label="How to handle the difference">
          <label className={mode === 'unallocated' ? 'on' : ''}>
            <input type="radio" name="recon" checked={mode === 'unallocated'} onChange={() => setMode('unallocated')} />
            Add the difference as an unallocated holding <small>(recommended) {fmt(st.diff)} stays in the account, so your net worth does not change</small>
          </label>
          <label className={mode === 'accept' ? 'on' : ''}>
            <input type="radio" name="recon" checked={mode === 'accept'} onChange={() => setMode('accept')} />
            Accept the new total <small>the account balance becomes {fmt(st.holdings)}</small>
          </label>
        </div>
      )}
      {!st.matches && !st.canAddUnallocated && <p className="note" style={{ margin: '8px 0 0' }}>Your holdings are worth more than the account's last balance, so the account will be updated to {fmt(st.holdings)}.</p>}
      <div style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={finish} disabled={!hasHoldings}>Finish linking</button>
        {!hasHoldings && <span className="sub"> Add at least one holding first.</span>}
      </div>
    </div>
  )
}

// One portfolio: link chip, reconcile banner while linking, holdings table with the total that feeds Finance.
export default function PortfolioPanel({ portfolio, country, account, staleDays, onAddHolding, onEditHolding, onTargets }) {
  const { data, update } = useVault()
  const { go } = useNav()
  const today = todayISO()
  const c = COUNTRIES[country]
  const hs = holdingsOf(data, portfolio.id)
  const total = hs.reduce((s, h) => s + holdingValue(h), 0)
  const fmt = (n) => money(country, n)
  const label = account ? `${account.name}${account.institution ? ` · ${account.institution}` : ''}` : 'removed account'
  const del = () => {
    if (!window.confirm(`Delete the portfolio “${portfolio.name}” and its ${hs.length} holding${hs.length === 1 ? '' : 's'}? The Finance account “${label}” stays, keeping its last balance.`)) return
    update((d) => removePortfolio(d, portfolio.id))
  }

  return (
    <div className="panel">
      <div className="p-head">
        <div className="title">{portfolio.name} <span className="chiplink">📈 {portfolio.reconciled ? 'linked to' : 'linking to'} Finance: {label}</span></div>
        <div className="row-actions">
          <button className="btn" onClick={() => go('finance', { country })}>Open in Finance</button>
          <button className="btn" onClick={() => onTargets(portfolio)}>{portfolio.targets ? 'Edit targets' : 'Set targets'}</button>
          <button className="btn danger-btn" onClick={del}>Delete portfolio</button>
          <button className="btn primary" onClick={() => onAddHolding(portfolio)}>+ Add holding</button>
        </div>
      </div>
      {!portfolio.reconciled && <ReconcileBanner portfolio={portfolio} country={country} hasHoldings={hs.length > 0} />}
      <div className="tblw"><table className="t-left t-h"><thead><tr><th>Holding</th><th>Class</th><th>Sector</th><th>Geography</th><th className="r">Units</th><th className="r">Price · date</th><th className="r">Value</th><th className="r">% of portfolio</th><th /></tr></thead><tbody>
        {hs.length === 0 && <tr><td colSpan="9" className="none">No holdings yet. Add one to start.</td></tr>}
        {hs.map((h) => {
          const age = priceAge(h, today)
          const stale = h.type !== 'unallocated' && age != null && age > staleDays
          return (
            <tr key={h.id}>
              <td><b>{h.name}</b> <span className="sub">{[h.ticker, typeLabel(h.type)].filter(Boolean).join(' · ')}</span></td>
              <td>{h.cls === 'mixed' ? 'Mixed' : h.cls === 'unallocated' ? 'Unallocated' : ({ equities: 'Equities', bonds: 'Bonds', cash: 'Cash equivalents', metals: 'Precious metals' })[h.cls]}</td>
              <td>{h.sector || '—'}</td><td>{h.geo || '—'}</td>
              <td className="r">{h.trackBy === 'units' ? h.units?.toLocaleString(c.locale) : '—'}</td>
              <td className="r">{h.trackBy === 'units' ? `${c.symbol}${h.price?.toLocaleString(c.locale, { maximumFractionDigits: 4 })}` : 'by value'}<br />
                {stale ? <span className="st s-soon">{age} days old</span> : <span className="sub">{h.priceDate ? fmtDate(h.priceDate).replace(/ \d{4}$/, '') : '—'}</span>}</td>
              <td className="r"><b>{fmt(holdingValue(h))}</b></td>
              <td className="r">{total > 0 ? ((100 * holdingValue(h)) / total).toFixed(1) : '0.0'}%</td>
              <td className="act">
                <button className="link" onClick={() => onEditHolding(portfolio, h)}>Edit</button>
                <button className="link danger" onClick={() => window.confirm(`Delete ${h.name}?`) && update((d) => removeHolding(d, h.id))}>Delete</button>
              </td>
            </tr>
          )
        })}
        {hs.length > 0 && <tr className="total"><td>Total{portfolio.reconciled ? ` → Finance “${label}”` : ''}</td><td colSpan="5" /><td className="r">{fmt(total)}</td><td className="r">100%</td><td /></tr>}
      </tbody></table></div>
    </div>
  )
}
