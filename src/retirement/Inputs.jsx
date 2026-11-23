import { useVault } from '../finance/VaultContext.jsx'
import { moneyCurrency, COUNTRIES, ownerLabel, curSym } from '../lib/format.js'
import { addIncome, addInheritance, assetAccounts, accountCurrency, marketAgeDays, planCurrencies, removeIncome, removeInheritance, setPlan, toggleAccount, updateIncome, updateInheritance } from '../lib/retirement.js'
import { portfolioFor } from '../lib/portfolio.js'
import { usePhone } from '../lib/usePhone.js'
import { NumRow, Row } from './fields.jsx'

// A section that can be folded away. Folded, it still shows a one-line summary (like "3 accounts · $ 412,000").
function Fold({ id, title, tag, summary, action, open = false, children }) {
  return (
    <details className="panel fold rfold" open={open} id={id}>
      <summary>{title}{tag}{summary ? <span className="sub rsum">{summary}</span> : null}</summary>
      {action && <div className="pad rfold-act">{action}</div>}
      <div className="pad">{children}</div>
    </details>
  )
}

export default function Inputs({ plan, fx }) {
  const { data, update } = useVault()
  const phone = usePhone()
  const r = data.retirement.plan
  const set = (patch) => update((d) => setPlan(d, patch))
  const cur = plan.currency
  const fmt = (n) => moneyCurrency(cur, n)
  const days = marketAgeDays(r.asOf)
  const accounts = assetAccounts(data)
  const currencies = planCurrencies(data)
  const rateOf = (c) => (c === fx.base ? 1 : fx.rates[c])
  const rateText = currencies.filter((c) => c !== cur && rateOf(c) > 0 && rateOf(cur) > 0).map((c) => `${curSym(cur)}1 = ${curSym(c)}${(rateOf(c) / rateOf(cur)).toLocaleString('en-US', { maximumFractionDigits: 2 })}`).join(' · ')
  const inheritTotal = r.inherit.reduce((s, x) => s + (Number(x.amt) || 0), 0)
  const insuranceCount = (data.policies || []).filter((p) => Number(p.deathBenefit) > 0).length

  return (
    <>
      <div className="panel">
        <div className="p-head"><div className="title">Your situation</div></div>
        <div className="pad">
          <NumRow label="Current age" value={r.age} onChange={(v) => set({ age: v })} width={90} />
          <NumRow label="Retirement age" value={r.retAge} onChange={(v) => set({ retAge: v })} width={90} />
          <NumRow label="Plan to age" value={r.life} onChange={(v) => set({ life: v })} width={90} />
          <NumRow label="Annual contribution" hint={`per year, in ${curSym(cur)}`} value={r.ac} onChange={(v) => set({ ac: v })} />
          <NumRow label="Contribution growth / yr (%)" hint="how fast your yearly saving rises" value={r.g} step="0.1" onChange={(v) => set({ g: v })} width={90} />
          <NumRow label="Spending in retirement" hint="today's money, per year" value={r.spend} onChange={(v) => set({ spend: v })} />
          <NumRow label="Effective tax on withdrawals (%)" value={r.tax} step="0.5" onChange={(v) => set({ tax: v })} width={90} />
          {!phone && (
            <Row label="Plan currency">
              <select value={cur} aria-label="Plan currency" onChange={(e) => set({ currency: e.target.value })}>
                {currencies.map((c) => <option key={c} value={c}>{curSym(c)}</option>)}
              </select>
            </Row>
          )}
        </div>
      </div>

      <Fold id="r-savings" title="Savings used for the plan" tag={<span className="src auto">from Finance</span>} summary={`${plan.picked.length} account${plan.picked.length === 1 ? '' : 's'} · ${fmt(plan.savings)}`}>
        <div className="sub" style={{ marginBottom: 6 }}>Tick the Finance asset accounts that are your retirement money. Balances update when Finance does, and everything is converted to {cur}{rateText ? ` (${rateText})` : ''}.</div>
        {accounts.length === 0 && <div className="sub">No asset accounts yet. Add some on the Assets tab, or type the amount in “Adjustment” below.</div>}
        {accounts.map((ac) => {
          const on = r.selected.includes(ac.id)
          const linked = portfolioFor(data, ac.id)?.reconciled
          const c = accountCurrency(ac)
          return (
            <label key={ac.id} className={`chk${on ? '' : ' off'}`}>
              <input type="checkbox" checked={on} onChange={() => update((d) => toggleAccount(d, ac.id))} aria-label={`Use ${ac.name}`} />
              <span>{ac.name} <span className="sub">{COUNTRIES[ac.country]?.flag}</span></span>
              <span className="amt">{moneyCurrency(c, ac.balance)}</span>
              <span className="sec">
                <span className={`chip c-${ac.owner}`}>{ownerLabel(ac.owner, data.settings.parentLabel)}</span>
                <span className="src">{linked ? '📈 from holdings' : 'savings only'}</span>
              </span>
            </label>
          )
        })}
        <NumRow label="Adjustment" hint="add or subtract money not in Finance" value={r.adjustment} onChange={(v) => set({ adjustment: v })} />
        <Row label={<b>Invested savings today</b>}><b>{fmt(plan.savings)}</b></Row>
        <NumRow label="Equity share of portfolio" hint={r.eqOverride === null || r.eqOverride === '' ? (plan.mixFrom === 'portfolios' ? `auto: ${plan.eqAuto.toFixed(1)}% from your linked portfolios` : 'auto: 60% (no portfolio linked)') : 'typed by you'}
          value={r.eqOverride} placeholder="auto" width={70} suffix=" %" onChange={(v) => set({ eqOverride: v === '' ? null : v })} />
        <div className="sub">Leave blank to use the mix of the ticked accounts that are linked to a Portfolio (calculated from its holdings), or a neutral 60% when none is.</div>
      </Fold>

      <Fold id="r-inherit" title="Inheritance" summary={r.inherit.length ? `${r.inherit.length} entr${r.inherit.length === 1 ? 'y' : 'ies'} · ${fmt(inheritTotal)}` : 'none'}
        action={<button className="btn sm" onClick={() => update((d) => addInheritance(d))}>+ Add inheritance</button>}>
        <div className="sub">Each is a flat amount, added to your savings in the year you enter, exactly as typed (it is not adjusted for inflation). Years in the past, or after your plan-to age, are ignored.</div>
        {r.inherit.length === 0 && <div className="sub">No inheritance expected.</div>}
        {r.inherit.map((x) => {
          const t = Number(x.year) - plan.nowYear
          const ignored = x.year === '' || !(t >= 0 && t < plan.life - plan.age)
          return (
            <div className="srcrow" key={x.id}>
              <label className="nm">Name<input value={x.name} onChange={(e) => update((d) => updateInheritance(d, x.id, { name: e.target.value }))} /></label>
              <button className="x" aria-label={`Remove ${x.name}`} title="Remove" onClick={() => update((d) => removeInheritance(d, x.id))}>✕</button>
              <label>Amount ({curSym(cur)})
                <input type="number" inputMode="decimal" value={x.amt} aria-label={`${x.name} amount`} onChange={(e) => update((d) => updateInheritance(d, x.id, { amt: e.target.value === '' ? '' : Number(e.target.value) }))} />
              </label>
              <label>Year
                <input type="number" value={x.year} aria-label={`${x.name} year`} onChange={(e) => update((d) => updateInheritance(d, x.id, { year: e.target.value === '' ? '' : Number(e.target.value) }))} />
              </label>
              <div className="sub" style={{ gridColumn: '1 / -1' }}>{ignored ? 'Not counted: the year is outside your plan.' : `Added in ${x.year}, when you are ${plan.age + t}.`}</div>
            </div>
          )
        })}
      </Fold>

      <Fold id="r-income" title="Income in retirement" summary={`${r.income.length} source${r.income.length === 1 ? '' : 's'}${r.includeInsurance ? ' + insurance' : ''}`}
        action={<button className="btn sm" onClick={() => update((d) => addIncome(d, cur))}>+ Add source</button>}>
        <div className="sub">Each source is in today's money, grows with inflation, and runs between its start and end age.</div>
        {r.income.length === 0 && <div className="sub">No income sources: all spending is funded from savings.</div>}
        {r.income.map((s) => (
          <div className="srcrow" key={s.id}>
            <label className="nm">Source<input value={s.name} onChange={(e) => update((d) => updateIncome(d, s.id, { name: e.target.value }))} /></label>
            <button className="x" aria-label={`Remove ${s.name}`} title="Remove" onClick={() => update((d) => removeIncome(d, s.id))}>✕</button>
            <label>Per year (today's money)
              <span className="two-in">
                <input type="number" inputMode="decimal" value={s.amt} aria-label={`${s.name} amount`} onChange={(e) => update((d) => updateIncome(d, s.id, { amt: e.target.value === '' ? '' : Number(e.target.value) }))} />
                <select value={s.cur || cur} aria-label={`${s.name} currency`} onChange={(e) => update((d) => updateIncome(d, s.id, { cur: e.target.value }))}>{currencies.map((c) => <option key={c} value={c}>{curSym(c)}</option>)}</select>
              </span>
            </label>
            <label>From age<input type="number" value={s.from} aria-label={`${s.name} from age`} onChange={(e) => update((d) => updateIncome(d, s.id, { from: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
            <label>To age<input type="number" value={s.to} placeholder="life" aria-label={`${s.name} to age`} onChange={(e) => update((d) => updateIncome(d, s.id, { to: e.target.value === '' ? '' : Number(e.target.value) }))} /></label>
          </div>
        ))}
        <label className="chk" style={{ marginTop: 8 }}>
          <input type="checkbox" checked={r.includeInsurance} onChange={(e) => set({ includeInsurance: e.target.checked })} aria-label="Include insurance survivor benefit" />
          <span>Include insurance survivor benefit
            <span className="sub" style={{ display: 'block' }}>
              {insuranceCount === 0
                ? 'No insurance policy with a death benefit in Finance yet.'
                : `Adds the death benefit of your ${insuranceCount} Finance polic${insuranceCount === 1 ? 'y' : 'ies'} (${fmt(plan.insurance)}) to your nest egg at retirement.`}
            </span>
          </span>
        </label>
      </Fold>

      <Fold id="r-market" title="Market conditions" tag={<span className="sub"> you update these</span>} open={!phone}>
        <NumRow label="10-yr government bond yield (%)" value={r.y} step="0.05" onChange={(v) => set({ y: v })} width={90} />
        <NumRow label="Inflation, CPI (%)" value={r.inf} step="0.05" onChange={(v) => set({ inf: v })} width={90} />
        <NumRow label="Equity return above inflation (%)" value={r.prem} step="0.1" onChange={(v) => set({ prem: v })} width={90} />
        <Row label="These figures are from" hint="so you know how fresh they are">
          <input type="date" value={r.asOf} aria-label="Market figures date" onChange={(e) => set({ asOf: e.target.value })} />
        </Row>
        {days === null && <div className="warnrow" style={{ margin: '6px 0' }}>These are placeholder values. Enter today's figures and the date you took them.</div>}
        {days !== null && days > 30 && <div className="warnrow" style={{ margin: '6px 0' }}>Market figures are {days} days old. Update them before relying on the result.</div>}
        <div className="sub">Bond return is assumed equal to the yield; equity return is inflation plus the premium. Starting values are placeholders, not live data.</div>
        <div className="sub" style={{ marginTop: 8 }}>Volatility, correlations, the spending rule, the target chance and the number of runs are under <b>Advanced</b>, below the three columns.</div>
      </Fold>
    </>
  )
}
