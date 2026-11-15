import { useVault } from '../finance/VaultContext.jsx'
import { moneyCurrency, COUNTRIES, ownerLabel } from '../lib/format.js'
import { addIncome, assetAccounts, accountCurrency, marketAgeDays, planCurrencies, planProblems, removeIncome, runPlan, setPlan, toggleAccount, updateIncome } from '../lib/retirement.js'
import { usePhone } from '../lib/usePhone.js'
import { portfolioFor } from '../lib/portfolio.js'
import { NumRow, Row } from './fields.jsx'
import { PathChart } from './RChart.jsx'

const SENS = [-2, -1, 0, 1, 2]

// Collapsible on a phone, an ordinary panel elsewhere.
function Section({ title, tag, action, simple, open, children }) {
  if (simple) {
    return (
      <details className="panel fold" open={open}>
        <summary>{title}{tag}</summary>
        <div className="pad">{children}</div>
      </details>
    )
  }
  return (
    <div className="panel">
      <div className="p-head"><div className="title">{title}{tag}</div>{action}</div>
      <div className="pad">{children}</div>
    </div>
  )
}

export default function PlanPage({ plan, fx }) {
  const { data, update } = useVault()
  const phone = usePhone()
  const r = data.retirement.plan
  const set = (patch) => update((d) => setPlan(d, patch))
  const cur = plan.currency
  const fmt = (n) => moneyCurrency(cur, n)
  const problems = planProblems(plan)
  const o = problems.length ? null : runPlan(plan)
  const surplus = o && o.shortfall <= 0
  const days = marketAgeDays(r.asOf)
  const accounts = assetAccounts(data)
  const currencies = planCurrencies(data)
  const rateOf = (c) => (c === fx.base ? 1 : fx.rates[c])
  const rateText = currencies.filter((c) => c !== cur && rateOf(c) > 0 && rateOf(cur) > 0).map((c) => `1 ${cur} = ${(rateOf(c) / rateOf(cur)).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${c}`).join(' · ')

  const results = (
    <>
      <div className="panel">
        <div className="p-head"><div className="title">Results <span className="sub">in {cur}{rateText ? `, at ${rateText}` : ''}</span></div></div>
        {problems.length > 0 && problems.map((p) => <div className="badrow" key={p}>{p}</div>)}
        {plan.missingRates && <div className="warnrow">An exchange rate is missing, so some amounts are counted as 0. Open Finance and set the rate.</div>}
        {o && (
          <>
            <div className="kpis3">
              {[
                [fmt(o.needed), 'Nest egg needed at retirement'],
                [fmt(o.balRet), 'Projected balance at retirement'],
                [(surplus ? '+ ' : '− ') + fmt(Math.abs(o.shortfall)), surplus ? 'Surplus vs need' : 'Shortfall vs need', surplus ? 'pos' : 'neg'],
                ...(phone ? [] : [
                  [fmt(o.balRetReal), "Projected, in today's money"],
                  [fmt(o.extra), 'Extra saving per year to close the gap', o.extra > 0 ? 'neg' : 'pos'],
                  [(o.r * 100).toFixed(2) + '%', 'Blended nominal return'],
                ]),
              ].map(([v, l, c]) => <div className="kpi" key={l}><small>{l}</small><b className={c || ''}>{v}</b></div>)}
            </div>
            {o.dep !== null
              ? <div className="badrow">At these assumptions the portfolio runs out around age <b>{o.dep}</b>, before the plan age of {plan.life}.</div>
              : <div className="okrow">At these assumptions the portfolio lasts through age <b>{plan.life}</b>.</div>}
            {!surplus && !phone && <div className="warnrow">Closing the gap would take about <b>{fmt(o.extra)}</b> more saved each year, growing with your contribution growth rate.</div>}
          </>
        )}
      </div>
      {o && (
        <div className="panel">
          <div className="p-head"><div className="title">Portfolio path <span className="sub">nominal money</span></div></div>
          <div className="chart"><PathChart w={phone ? 340 : 640} path={o.path} retAge={plan.retAge} currency={cur} /></div>
          <div className="legend pad0"><span><i style={{ background: 'var(--accent)' }} />Projected portfolio</span><span><i style={{ background: 'var(--grey)' }} />Retirement age</span></div>
        </div>
      )}
      {o && !phone && (
        <div className="panel">
          <div className="p-head"><div className="title">Sensitivity to the 10-year yield</div></div>
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
          <div className="pad sub">Each row changes only the yield, applied to the bond share in both the saving and the retirement phases.</div>
        </div>
      )}
      <div className="panel"><div className="pad sub">Estimates only, not financial advice. Saved in your encrypted file; nothing is sent anywhere.</div></div>
    </>
  )

  return (
    <div className="cols2">
      {phone && <div>{results}</div>}
      <div>
        <Section title="Your situation" simple={false}>
          <NumRow label="Current age" value={r.age} onChange={(v) => set({ age: v })} width={90} />
          <NumRow label="Retirement age" value={r.retAge} onChange={(v) => set({ retAge: v })} width={90} />
          <NumRow label="Plan to age" value={r.life} onChange={(v) => set({ life: v })} width={90} />
          <NumRow label="Annual contribution" hint={`in ${cur}`} value={r.ac} onChange={(v) => set({ ac: v })} />
          <NumRow label="Spending in retirement" hint="today's money, per year" value={r.spend} onChange={(v) => set({ spend: v })} />
          {!phone && <NumRow label="Contribution growth / yr (%)" value={r.g} step="0.1" onChange={(v) => set({ g: v })} width={90} />}
          {!phone && <NumRow label="Effective tax on withdrawals (%)" value={r.tax} step="0.5" onChange={(v) => set({ tax: v })} width={90} />}
          {!phone && (
            <Row label="Plan currency">
              <select value={cur} aria-label="Plan currency" onChange={(e) => set({ currency: e.target.value })}>
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Row>
          )}
        </Section>

        <Section simple={phone} open={!phone} title="Savings used for the plan" tag={<span className="src auto">from Finance</span>}>
          <div className="sub" style={{ marginBottom: 6 }}>Tick the Finance asset accounts that are your retirement money. Balances update when Finance does, and everything is converted to {cur}{rateText ? ` (${rateText})` : ''}.</div>
          {accounts.length === 0 && <div className="sub">No asset accounts yet. Add some on the Finance Dashboard tab, or type the amount in “Adjustment” below.</div>}
          {accounts.map((a) => {
            const on = r.selected.includes(a.id)
            const linked = portfolioFor(data, a.id)?.reconciled
            const c = accountCurrency(a)
            return (
              <label key={a.id} className={`chk${on ? '' : ' off'}`}>
                <input type="checkbox" checked={on} onChange={() => update((d) => toggleAccount(d, a.id))} aria-label={`Use ${a.name}`} />
                <span>{a.name} <span className="sub">{COUNTRIES[a.country]?.flag}</span></span>
                <span className="amt">{moneyCurrency(c, a.balance)}</span>
                <span className="sec">
                  <span className={`chip c-${a.owner}`}>{ownerLabel(a.owner, data.settings.parentLabel)}</span>
                  <span className="src">{linked ? '📈 from holdings' : a.mix?.[0] ? 'asset mix' : 'cash'}</span>
                </span>
              </label>
            )
          })}
          <NumRow label="Adjustment" hint="add or subtract money not in Finance" value={r.adjustment} onChange={(v) => set({ adjustment: v })} />
          <Row label={<b>Invested savings today</b>}><b>{fmt(plan.savings)}</b></Row>
          <NumRow label="Equity share of portfolio" hint={r.eqOverride === null || r.eqOverride === '' ? `auto: ${plan.eqAuto.toFixed(1)}% from your accounts` : 'typed by you'}
            value={r.eqOverride} placeholder="auto" width={70} suffix=" %" onChange={(v) => set({ eqOverride: v === '' ? null : v })} />
          <div className="sub">Leave blank to use the asset mix of the ticked accounts (from your Portfolio holdings where an account is linked).</div>
        </Section>

        <Section simple={phone} open={false} title="Income in retirement" action={<button className="btn sm" onClick={() => update((d) => addIncome(d, cur))}>+ Add source</button>}>
          <div className="sub">Each source is in today's money, grows with inflation, and runs between its start and end age.</div>
          {r.income.length === 0 && <div className="sub">No income sources: all spending is funded from savings.</div>}
          {r.income.map((s) => (
            <div className="srcrow" key={s.id}>
              <label className="nm">Source<input value={s.name} onChange={(e) => update((d) => updateIncome(d, s.id, { name: e.target.value }))} /></label>
              <button className="x" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => update((d) => removeIncome(d, s.id))}>✕</button>
              <label>Per year (today's money)
                <span className="two-in">
                  <input type="number" inputMode="decimal" value={s.amt} aria-label={`${s.name} amount`} onChange={(e) => update((d) => updateIncome(d, s.id, { amt: e.target.value === '' ? '' : Number(e.target.value) }))} />
                  <select value={s.cur || cur} aria-label={`${s.name} currency`} onChange={(e) => update((d) => updateIncome(d, s.id, { cur: e.target.value }))}>{currencies.map((c) => <option key={c}>{c}</option>)}</select>
                </span>
              </label>
              <label>From age<input type="number" value={s.from} aria-label={`${s.name} from age`} onChange={(e) => update((d) => updateIncome(d, s.id, { from: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
              <label>To age<input type="number" value={s.to} placeholder="life" aria-label={`${s.name} to age`} onChange={(e) => update((d) => updateIncome(d, s.id, { to: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
            </div>
          ))}
        </Section>

        <Section simple={phone} open={false} title="Market conditions" tag={<span className="sub"> you update these</span>}>
          <NumRow label="10-yr government bond yield (%)" value={r.y} step="0.05" onChange={(v) => set({ y: v })} width={90} />
          <NumRow label="Inflation, CPI (%)" value={r.inf} step="0.05" onChange={(v) => set({ inf: v })} width={90} />
          <NumRow label="Equity return above inflation (%)" value={r.prem} step="0.1" onChange={(v) => set({ prem: v })} width={90} />
          <Row label="These figures are from" hint="so you know how fresh they are">
            <input type="date" value={r.asOf} aria-label="Market figures date" onChange={(e) => set({ asOf: e.target.value })} />
          </Row>
          {days === null && <div className="warnrow" style={{ margin: '6px 0' }}>These are placeholder values. Enter today's figures and the date you took them.</div>}
          {days !== null && days > 30 && <div className="warnrow" style={{ margin: '6px 0' }}>Market figures are {days} days old. Update them before relying on the result.</div>}
          <div className="sub">Bond return is assumed equal to the yield; equity return is inflation plus the premium. Starting values are placeholders, not live data.</div>
        </Section>
      </div>
      {!phone && <div>{results}</div>}
    </div>
  )
}
