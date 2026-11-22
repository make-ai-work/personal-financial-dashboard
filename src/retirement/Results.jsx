import { useVault } from '../finance/VaultContext.jsx'
import { moneyCurrency } from '../lib/format.js'
import { incomeAt } from '../lib/montecarlo.js'
import { usePhone } from '../lib/usePhone.js'

const pct = (x, d = 0) => (x * 100).toFixed(d) + '%'

// The middle column: Chance of success, then Results, then Monthly income (planned vs projected). All in today's money.
export default function Results({ plan, a, o, A, busy, problems, corOk }) {
  const { demo } = useVault()
  const phone = usePhone()
  const cur = plan.currency
  const fmt = (n) => moneyCurrency(cur, n)
  const target = a.target / 100
  const onTrack = A ? A.succ >= target : o ? o.shortfall <= 0 : null
  const cls = !A ? '' : A.succ >= target ? 'big-ok' : A.succ >= target - 0.15 ? 'big-mid' : 'big-bad'
  const surplus = o && o.shortfall <= 0
  const status = onTrack === null ? null : <span className={`pill ${onTrack ? 'ok' : 'bad'}`} data-testid="track">{onTrack ? 'On track' : 'Off track'}</span>
  const fixes = (
    <>
      {problems.map((p) => <div className="badrow" key={p}>{p}</div>)}
      {!corOk && <div className="badrow">The correlations are not mathematically possible together, so nothing can be simulated. Open Market conditions → Advanced and use “Make valid”.</div>}
      {plan.missingRates && <div className="warnrow">An exchange rate is missing, so some amounts are counted as 0. Open Assets and set the rate.</div>}
    </>
  )

  // Monthly income at the start of retirement. Planned = what you said you want to spend; projected = the spending the simulation can keep
  // up to the plan age with your target chance. Income sources come first, savings withdrawals make up the rest.
  const retAge = plan.retAge
  const sources = plan.income.map((s) => ({ ...s, active: retAge >= (s.from ?? 0) && (s.to === '' || s.to == null || retAge <= s.to) }))
  const inc = incomeAt(plan, retAge)
  const plannedTotal = Math.max(plan.spend, inc)
  const projectedTotal = A ? Math.max(A.safe, inc) : null
  const m = (n) => fmt(n / 12)

  return (
    <>
      <div className="panel" data-testid="chance-box">
        <div className="p-head"><div className="title">Chance of success <span className="sub">{a.n.toLocaleString()} simulations{busy ? ' · calculating…' : ''}</span></div>{status}</div>
        {fixes}
        {A ? (
          <>
            <div className="pad rbig" style={busy ? { opacity: 0.5 } : undefined}>
              <b className={cls} data-testid="chance">{pct(A.succ, 1)}</b>
              <span className="sub">chance your savings last to age {plan.life}</span>
            </div>
            <div className="kpis3" style={busy ? { opacity: 0.5 } : undefined}>
              {[
                [fmt(A.atRetirement.p50), 'Median savings at retirement'],
                [`${fmt(A.atRetirement.p10)} – ${fmt(A.atRetirement.p90)}`, '10th to 90th percentile at retirement'],
                [fmt(A.atEnd.p50), `Median left at age ${plan.life}`],
                [A.medianDepletion ? `Age ${A.medianDepletion}` : '—', 'Typical age money runs out, where it does'],
              ].map(([v, l]) => <div className="kpi" key={l}><small>{l}</small><b>{v}</b></div>)}
            </div>
            {A.succ >= target
              ? <div className="okrow">On track: this plan meets your {a.target}% target.</div>
              : <div className={A.succ >= target - 0.15 ? 'warnrow' : 'badrow'}>Off track: below your {a.target}% target. Spending about <b>{fmt(A.safe)}</b> a year (today's money) would reach it, against {fmt(plan.spend)} now.</div>}
            {!phone && <div className="pad sub">Success depends heavily on the assumptions. A single percentage looks more precise than it is, so also look at the spread.</div>}
          </>
        ) : <div className="pad sub">Fix the items above to see the chance.</div>}
      </div>

      <div className="panel" data-testid="results-box">
        <div className="p-head"><div className="title">Results</div>{status}</div>
        {o && (
          <>
            <div className="kpis3">
              {[
                [fmt(o.needed), 'Nest egg needed at retirement'],
                [fmt(o.balRet), 'Projected balance at retirement', plan.lumps.length ? `includes ${plan.lumps.map((l) => l.name || 'inheritance').join(', ')}` : ''],
                [(surplus ? '+ ' : '− ') + fmt(Math.abs(o.shortfall)), surplus ? 'Surplus vs need' : 'Shortfall vs need', '', surplus ? 'pos' : 'neg'],
                [fmt(o.extra), 'Extra savings per year to close the gap', '', o.extra > 0 ? 'neg' : 'pos'],
                ...(phone ? [] : [
                  [fmt(o.balRetReal), "Projected, in today's money"],
                  [(o.r * 100).toFixed(2) + '%', 'Blended nominal return'],
                ]),
              ].map(([v, l, note, c]) => <div className="kpi" key={l}><small>{l}</small><b className={c || ''}>{v}</b>{note ? <small className="knote">{note}</small> : null}</div>)}
            </div>
            {o.dep !== null
              ? <div className="badrow">At these steady assumptions the portfolio runs out around age <b>{o.dep}</b>, before the plan age of {plan.life}.</div>
              : <div className="okrow">At these steady assumptions the portfolio lasts through age <b>{plan.life}</b>.</div>}
            {!surplus && <div className="warnrow">Closing the gap would take about <b>{fmt(o.extra)}</b> more saved each year, growing with your contribution growth rate.</div>}
          </>
        )}
        {!o && <div className="pad sub">Fix the items above to see the results.</div>}
      </div>

      <div className="panel" data-testid="monthly-income">
        <div className="p-head"><div className="title">Monthly income in retirement <span className="sub">today's money, from age {retAge}</span></div></div>
        <div className="kpis3">
          <div className="kpi"><small>Planned per month</small><b data-testid="planned-month">{m(plannedTotal)}</b></div>
          <div className="kpi"><small>Projected per month</small><b data-testid="projected-month" className={A && projectedTotal >= plannedTotal ? 'pos' : A ? 'neg' : ''}>{A ? m(projectedTotal) : '…'}</b></div>
          <div className="kpi"><small>Difference</small><b className={A && projectedTotal >= plannedTotal ? 'pos' : 'neg'}>{A ? (projectedTotal >= plannedTotal ? '+ ' : '− ') + m(Math.abs(projectedTotal - plannedTotal)) : '…'}</b></div>
        </div>
        <div className="tblw">
          <table className="t-left">
            <thead><tr><th>Source</th><th className="r">Planned</th><th className="r">Projected</th></tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id}><td>{s.name || 'Income'}{!s.active && <span className="sub"> starts at {s.from}</span>}</td><td className="r">{s.active ? m(s.amt) : m(0)}</td><td className="r">{s.active ? m(s.amt) : m(0)}</td></tr>
              ))}
              <tr><td>Withdrawals from savings</td><td className="r">{m(Math.max(0, plannedTotal - inc))}</td><td className="r">{A ? m(Math.max(0, projectedTotal - inc)) : '…'}</td></tr>
              <tr className="total"><td>Total</td><td className="r">{m(plannedTotal)}</td><td className="r">{A ? m(projectedTotal) : '…'}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="pad sub"><b>Planned</b> is your spending target of {fmt(plan.spend)} a year, divided by 12. <b>Projected</b> is the most the simulation can pay each month and still last to age {plan.life} with a {a.target}% chance. Income sources are counted first and savings make up the rest. Sources that start later raise the total from their start age.</div>
      </div>

      <div className="panel"><div className="pad sub">Estimates only, not financial advice. {demo ? 'Nothing is saved in demo mode.' : 'Saved in your encrypted vault; nothing is sent anywhere.'}</div></div>
    </>
  )
}
