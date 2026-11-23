import { useState } from 'react'
import { parseAmount } from '../lib/format.js'
import { holdingsOf, rebalance } from '../lib/portfolio.js'
import NumInput from '../finance/NumInput.jsx'

export default function Rebalance({ data, portfolios, tolerance, format, onEditTargets }) {
  const [id, setId] = useState(portfolios[0]?.id)
  const [money, setMoney] = useState('')
  const p = portfolios.find((x) => x.id === id) || portfolios[0]
  if (!p) return null
  const nm = money === '' ? 0 : Math.max(0, parseAmount(money) || 0)
  const r = rebalance(p, holdingsOf(data, p.id), tolerance, nm)

  return (
    <div className="panel">
      <div className="p-head">
        <div className="title">Rebalancing</div>
        <div className="row-actions">
          {portfolios.length > 1 && (
            <select className="pw sm" aria-label="Portfolio to rebalance" value={p.id} onChange={(e) => setId(e.target.value)}>
              {portfolios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          <button className="btn" onClick={() => onEditTargets(p)}>{p.targets ? 'Edit targets' : 'Set targets'}</button>
        </div>
      </div>
      {!r && <div className="empty">Set target percentages for {p.name} to see how far each asset class has drifted and what to buy or sell.</div>}
      {r?.invalid && <div className="empty">The targets for {p.name} don't add up to 100%. Edit them to continue.</div>}
      {r && !r.invalid && (
        <>
          <div className="tblw"><table className="t-left"><thead><tr><th>Asset class</th><th className="r">Now</th><th className="r">Target</th><th>Drift</th><th className="r">To reach target</th><th /></tr></thead><tbody>
            {r.rows.map((x) => (
              <tr key={x.key}>
                <td><b style={{ color: x.color }}>■</b> {x.label}</td>
                <td className="r">{x.pct.toFixed(1)}% <span className="sub">{format(x.value)}</span></td>
                <td className="r">{x.target}%</td>
                <td>
                  <div className="drift-bar"><div className="cu" style={{ width: `${Math.min(100, x.pct)}%`, background: x.color }} /><div className="tg" style={{ left: `${x.target}%` }} /></div>
                  <span className="sub">{x.drift >= 0 ? '+' : '−'}{Math.abs(x.drift).toFixed(1)} pts</span>
                </td>
                <td className="r">{Math.abs(x.toTarget) < 1 ? '—' : x.toTarget > 0 ? <span className="pos">Buy {format(x.toTarget)}</span> : <span className="neg">Sell {format(-x.toTarget)}</span>}</td>
                <td>{x.off ? <span className="st s-soon">off target</span> : <span className="st s-ok">on target</span>}</td>
              </tr>
            ))}
          </tbody></table></div>
          <div className="pad sub" style={{ borderTop: '1px solid var(--line)' }}>
            Targets are percentages of {p.name} ({format(r.base)}). Class level only: it shows how much to move between classes, not which fund to pick. Tolerance ±{tolerance} pts.
            {r.unallocated > 0 && <> Unallocated money ({format(r.unallocated)}) is left out.</>}
          </div>
          <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
            <label className="field" style={{ margin: 0, maxWidth: 340 }}>New money to invest (optional)
              <NumInput className="pw" value={money} onChange={(e) => setMoney(e.target.value)} />
            </label>
            {r.plan && (
              <div className="buyonly" style={{ marginTop: 10 }}>
                <b>Buy-only plan for {format(nm)} of new money</b> <span className="sub">(no selling)</span>
                <div className="leg" style={{ marginTop: 6 }}>
                  {r.plan.filter((x) => x.buy >= 1).map((x) => (
                    <span key={x.key}><i style={{ background: x.color }} />{x.label}: buy <b>{format(x.buy)}</b> → {x.afterPct.toFixed(1)}% <span className="sub">(target {x.target}%)</span></span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
