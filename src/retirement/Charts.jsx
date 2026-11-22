import { moneyCurrency, todayISO } from '../lib/format.js'
import { summarise } from '../lib/montecarlo.js'
import { runPlan } from '../lib/retirement.js'
import { useVault } from '../finance/VaultContext.jsx'
import { usePhone } from '../lib/usePhone.js'
import { CompareChart, FanChart, Histogram, SurvivalChart, survivalWindow } from './RChart.jsx'

const COLORS = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--purple)']
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%'
const SENS = [-2, -1, 0, 1, 2]

// The right column: the two simulation charts, then (folded) when it runs out, the yield sensitivity and a comparison of the saved plans.
export default function Charts({ plan, a, A, o }) {
  const { data } = useVault()
  const phone = usePhone()
  const r = data.retirement.plan
  const versions = data.retirement.versions
  const cur = plan.currency
  const fmt = (n) => moneyCurrency(cur, n)
  const rows = [
    ...versions.map((v, i) => ({ key: v.id, label: `${i + 1}. ${v.name}`, s: v.summary, mcv: v.mc, pl: v.plan, color: COLORS[i + 1], med50: v.summary.med50 })),
    ...(A ? [{ key: 'cur', label: 'Current (unsaved edits)', s: summarise(A, plan), mcv: data.retirement.mc, pl: data.retirement.plan, color: COLORS[0], current: true, med50: A.bands.map((d) => [d.age, Math.round(d.p50)]) }] : []),
  ]
  if (!A) return <div className="panel"><div className="pad sub">The charts appear once the inputs are valid.</div></div>
  const w = survivalWindow(A.surv, plan.retAge, plan.life)
  return (
    <>
      <div className="panel" data-testid="fan-chart">
        <div className="p-head"><div className="title">Projected Net Worth <span className="sub">today's money</span></div></div>
        <div className="chart"><FanChart w={phone ? 340 : 640} bands={A.bands} retAge={plan.retAge} currency={cur} /></div>
        <div className="legend pad0">
          <span><i style={{ background: 'var(--accent)' }} />Median</span>
          <span><i className="sw" style={{ background: 'var(--accent)', opacity: 0.35 }} />Middle 50% of futures</span>
          <span><i className="sw" style={{ background: 'var(--accent)', opacity: 0.14 }} />10th to 90th percentile</span>
          <span><i style={{ background: 'var(--grey)' }} />Retirement</span>
        </div>
      </div>
      <div className="panel" data-testid="survival-chart">
        <div className="p-head"><div className="title">Chance your savings last <span className="sub">{w.zoomed ? `zoomed to ages ${w.from}–${plan.life}; it stays at 100% before that` : ''}</span></div></div>
        <div className="chart"><SurvivalChart w={phone ? 340 : 640} surv={A.surv} retAge={plan.retAge} life={plan.life} target={a.target} /></div>
      </div>
      <details className="panel fold" data-testid="more-charts">
        <summary>More: when it runs out, yield sensitivity, compare plans</summary>
        <div className="pad">
          <h3 className="sect">When it runs out</h3>
          {A.failed.length
            ? <><Histogram failed={A.failed} retAge={plan.retAge} life={plan.life} n={a.n} /><div className="sub">Each bar is an age; taller means more futures ran out then. {(A.failed.length / a.n * 100).toFixed(1)}% of futures run out, typically around age {A.medianDepletion}.</div></>
            : <div className="okrow">In none of these futures does the money run out.</div>}
          {o && (
            <>
              <h3 className="sect">Sensitivity to the 10-year yield</h3>
              <div className="tblw">
                <table className="t-left">
                  <thead><tr><th>10-yr yield</th><th className="r">Blended return</th><th className="r">Nest egg needed</th><th className="r">Projected at ret.</th><th className="r">Extra / yr</th></tr></thead>
                  <tbody>
                    {SENS.filter((d) => Number(r.y) + d >= 0).map((d) => {
                      const s = runPlan(plan, { y: (Number(r.y) + d) / 100 })
                      return (
                        <tr key={d} className={d === 0 ? 'cur' : ''}>
                          <td>{(Number(r.y) + d).toFixed(1)}%{d === 0 ? ' (yours)' : ''}</td><td className="r">{(s.r * 100).toFixed(2)}%</td>
                          <td className="r">{fmt(s.needed)}</td><td className="r">{fmt(s.balRet)}</td><td className="r">{fmt(s.extra)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="sub">Each row changes only the yield, applied to the bond share in both the saving and the retirement phases.</div>
            </>
          )}
          <h3 className="sect">Compare plans</h3>
          <div className="tblw">
            <table id="cmp" className="t-left">
              <thead><tr><th>Plan</th><th className="r">Retire</th><th className="r">Spend/yr</th><th className="r">Chance</th>{!phone && <th className="r">Median at ret.</th>}{!phone && <th className="r">Safe spend</th>}</tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.key} className={x.current ? 'cur' : ''}>
                    <td><i className="swatch" style={{ background: x.color }} />{x.label}{x.mcv.rule === 'flex' && <span className="sub"> (flexible)</span>}</td>
                    <td className="r">{x.pl.retAge}</td><td className="r">{fmt(x.pl.spend)}</td><td className="r">{pct(x.s.succ, 1)}</td>
                    {!phone && <td className="r">{fmt(x.s.medRet)}</td>}{!phone && <td className="r">{fmt(x.s.safe)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!phone && <><div className="chart"><CompareChart rows={rows} currency={cur} /></div>
            <div className="legend pad0">{rows.map((x) => <span key={x.key}><i style={{ background: x.color }} />{x.label} <span className="sub">median path</span></span>)}</div></>}
          <details className="sub" style={{ marginTop: 10 }}><summary>How it works</summary>
            <div className="pad sub">Each of the simulated futures draws a random real return for each asset class every year (lognormal, correlated as in the assumptions), applies your contributions until retirement, then withdraws your spending less income, grossed up for tax, at the start of each year. Inheritance and the insurance benefit are added in the year they arrive, as flat amounts. A future “fails” if the money runs out before the plan age. Results are in today's money, so inflation is already stripped out. Estimates only, not financial advice.</div>
          </details>
        </div>
      </details>
    </>
  )
}
