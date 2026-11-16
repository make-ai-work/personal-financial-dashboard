import { useEffect, useMemo, useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import { moneyCurrency, todayISO } from '../lib/format.js'
import { analyse, COR_PAIRS, KEYS, KEY_LABEL, correlationsValid, makeValid, portfolioStats, summarise } from '../lib/montecarlo.js'
import { MAX_VERSIONS, canSaveVersion, deleteVersion, loadVersion, overwriteVersion, planProblems, renameVersion, resolveMc, saveVersion, setMc } from '../lib/retirement.js'
import { usePhone } from '../lib/usePhone.js'
import { CompareChart, FanChart, Histogram, SurvivalChart, survivalWindow } from './RChart.jsx'
import { NumRow, Row } from './fields.jsx'

const COLORS = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--purple)']
const pct = (x, d = 0) => (x * 100).toFixed(d) + '%'

// Run the simulation after a short pause so typing in a field stays responsive.
function useAnalysis(a, plan, enabled) {
  const key = JSON.stringify([a, plan.age, plan.retAge, plan.life, plan.savings, plan.ac, plan.g, plan.tax, plan.inf, plan.spend, plan.income, enabled])
  const [state, setState] = useState({ key: '', A: null })
  useEffect(() => {
    if (!enabled) { setState({ key, A: null }); return undefined }
    const t = setTimeout(() => setState({ key, A: analyse(a, plan) }), 120)
    return () => clearTimeout(t)
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return { A: state.A, busy: state.key !== key }
}

export default function MonteCarlo({ plan }) {
  const { data, update } = useVault()
  const phone = usePhone()
  const mc = data.retirement.mc
  const versions = data.retirement.versions
  const cur = plan.currency
  const fmt = (n) => moneyCurrency(cur, n)
  const a = resolveMc(mc, plan)
  const problems = planProblems(plan)
  const corOk = correlationsValid(a.cor)
  const { A, busy } = useAnalysis(a, plan, problems.length === 0 && corOk)
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState(null)
  const set = (patch) => update((d) => setMc(d, patch))
  const stats = useMemo(() => (corOk ? portfolioStats(a) : null), [JSON.stringify(a)]) // eslint-disable-line react-hooks/exhaustive-deps
  const target = a.target / 100
  const cls = !A ? '' : A.succ >= target ? 'big-ok' : A.succ >= target - 0.15 ? 'big-mid' : 'big-bad'
  const total = KEYS.reduce((s, k) => s + (Number(a.w[k]) || 0), 0)
  const today = todayISO()

  const rows = [
    ...versions.map((v, i) => ({ key: v.id, label: `${i + 1}. ${v.name}`, s: v.summary, mcv: v.mc, pl: v.plan, color: COLORS[i + 1], med50: v.summary.med50 })),
    ...(A ? [{ key: 'cur', label: 'Current (unsaved)', s: summarise(A, plan), mcv: mc, pl: data.retirement.plan, color: COLORS[0], current: true, med50: A.bands.map((d) => [d.age, Math.round(d.p50)]) }] : []),
  ]

  const doSave = () => { update((d) => saveVersion(d, name, summarise(A, plan), today)); setName('') }

  // ---- panels ----
  const planStrip = (
    <div className="panel">
      <div className="p-head"><div className="title">Your plan <span className="sub">from the Plan tab, read-only here</span></div></div>
      <div className="kpis3">
        {[['Age', plan.age], ['Retirement age', plan.retAge], ['Plan to age', plan.life], ['Savings today', fmt(plan.savings)], ['Contribution / yr', fmt(plan.ac)], ['Spending / yr', fmt(plan.spend)],
          ...(phone ? [] : [['Income sources', plan.income.length ? `${plan.income.length} (${plan.income.map((x) => x.name).join(', ')})` : 'none']])]
          .map(([l, v]) => <div className="kpi" key={l}><small>{l}</small><b style={{ fontSize: '1rem' }}>{v}</b></div>)}
      </div>
    </div>
  )

  const results = (
    <div className="panel">
      <div className="p-head"><div className="title">Results <span className="sub">{a.n.toLocaleString()} simulations · seed {a.seed}{busy ? ' · calculating…' : ''}</span></div></div>
      {problems.map((p) => <div className="badrow" key={p}>{p} Fix it on the Plan tab.</div>)}
      {!corOk && <div className="badrow">The correlations are not mathematically possible together, so nothing can be simulated. Use “Make valid” in the correlations panel below.</div>}
      {plan.missingRates && <div className="warnrow">An exchange rate is missing, so some amounts are counted as 0.</div>}
      {A && (
        <>
          <div className="kpis3" style={busy ? { opacity: 0.5 } : undefined}>
            {[
              [<span className={cls} key="s">{pct(A.succ, 1)}</span>, `Chance your savings last to age ${plan.life}`],
              [fmt(A.atRetirement.p50), 'Median savings at retirement'],
              [fmt(A.safe), `Spending per year with a ${a.target}% chance`],
              ...(phone ? [] : [
                [`${fmt(A.atRetirement.p10)} – ${fmt(A.atRetirement.p90)}`, '10th to 90th percentile at retirement'],
                [fmt(A.atEnd.p50), `Median left at age ${plan.life}`],
                [A.medianDepletion ? `Age ${A.medianDepletion}` : '—', 'Typical age money runs out, in the futures where it does'],
              ]),
            ].map(([v, l]) => <div className="kpi" key={l}><small>{l}</small><b>{v}</b></div>)}
          </div>
          {A.succ >= target
            ? <div className="okrow">This plan meets your {a.target}% target.</div>
            : <div className={A.succ >= target - 0.15 ? 'warnrow' : 'badrow'}>Below your {a.target}% target. Spending about <b>{fmt(A.safe)}</b> a year (today's money) would reach it, against {fmt(plan.spend)} now.</div>}
          {!phone && <div className="pad sub">Success depends heavily on the assumptions below. A single percentage looks more precise than it is, so also look at the spread.</div>}
        </>
      )}
    </div>
  )

  const fan = A && (
    <div className="panel">
      <div className="p-head"><div className="title">Projected Net Worth <span className="sub">today's money</span></div></div>
      <div className="chart"><FanChart w={phone ? 340 : 640} bands={A.bands} retAge={plan.retAge} currency={cur} /></div>
      <div className="legend pad0">
        <span><i style={{ background: 'var(--accent)' }} />Median</span>
        <span><i className="sw" style={{ background: 'var(--accent)', opacity: 0.35 }} />Middle 50% of futures</span>
        <span><i className="sw" style={{ background: 'var(--accent)', opacity: 0.14 }} />10th to 90th percentile</span>
        <span><i style={{ background: 'var(--grey)' }} />Retirement</span>
      </div>
    </div>
  )

  const surv = A && (() => {
    const w = survivalWindow(A.surv, plan.retAge, plan.life)
    return (
      <div className="panel">
        <div className="p-head"><div className="title">Chance your savings last <span className="sub">{w.zoomed ? `zoomed to ages ${w.from}–${plan.life}; it stays at 100% before that` : ''}</span></div></div>
        <div className="chart"><SurvivalChart w={phone ? 340 : 640} surv={A.surv} retAge={plan.retAge} life={plan.life} target={a.target} /></div>
      </div>
    )
  })()

  const hist = A && !phone && (
    <div className="panel">
      <div className="p-head"><div className="title">When it runs out <span className="sub">{A.failed.length ? `${A.failed.length.toLocaleString()} of ${a.n.toLocaleString()} futures` : ''}</span></div></div>
      {A.failed.length
        ? <><Histogram failed={A.failed} retAge={plan.retAge} life={plan.life} n={a.n} /><div className="pad sub">Each bar is an age; taller means more futures ran out then. {(A.failed.length / a.n * 100).toFixed(1)}% of futures run out, typically around age {A.medianDepletion}.</div></>
        : <div className="okrow">In none of these futures does the money run out.</div>}
    </div>
  )

  const versionsPanel = (
    <div className="panel">
      <div className="p-head"><div className="title">Saved versions <span className="sub">{versions.length} of {MAX_VERSIONS} used</span></div></div>
      <div className="vers">
        {Array.from({ length: MAX_VERSIONS }, (_, i) => versions[i] || null).map((v, i) => v ? (
          <div className="slot" key={v.id} data-testid="version">
            <h4>
              {renaming === v.id
                ? <input autoFocus defaultValue={v.name} maxLength={40} aria-label="Version name" onBlur={(e) => { update((d) => renameVersion(d, v.id, e.target.value)); setRenaming(null) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                : <>{i + 1}. {v.name}</>}
            </h4>
            <div className="m">saved {v.savedAt}</div>
            <div className="big">{pct(v.summary.succ)} <span className="m">chance</span></div>
            {!phone && <div className="m">Retire at {v.plan.retAge} · spend {fmt(v.plan.spend)} · {v.mc.rule === 'flex' ? 'flexible' : 'fixed'}</div>}
            {Math.abs(v.summary.savings - plan.savings) > Math.max(1, plan.savings * 0.005) && !phone && <div className="m">Savings then: {fmt(v.summary.savings)}. Loading recalculates with today's balances.</div>}
            <div className="acts">
              <button className="btn sm" onClick={() => update((d) => loadVersion(d, v.id))}>Load</button>
              {!phone && <button className="btn sm" disabled={!A} onClick={() => A && update((d) => overwriteVersion(d, v.id, summarise(A, plan), today))}>Overwrite with current</button>}
              {!phone && <button className="btn sm" onClick={() => setRenaming(v.id)}>Rename</button>}
              <button className="btn sm danger-btn" onClick={() => window.confirm(`Delete “${v.name}”?`) && update((d) => deleteVersion(d, v.id))}>Delete</button>
            </div>
          </div>
        ) : (
          <div className="slot empty" key={`e${i}`}><div>Slot {i + 1} is empty</div><div className="m">Save your current inputs here</div></div>
        ))}
      </div>
      <div className="namefld">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for a new version" maxLength={40} aria-label="New version name" />
        <button className="btn primary" disabled={!canSaveVersion(data) || !A || busy} onClick={doSave}>Save as new version</button>
        {!canSaveVersion(data) && <span className="sub">All {MAX_VERSIONS} slots are used: overwrite or delete one to save another.</span>}
      </div>
      <details className="sub">
        <summary>What is a version?</summary>
        <div className="pad sub">A version stores all your inputs: plan, assumptions, spending rule, number of simulations and the random seed. Results are recalculated when you load it, and the same seed gives the same answer.</div>
      </details>
    </div>
  )

  const assumptions = (
    <>
      <h2 className="sect">Assumptions <span className="sub">change any of these and the results above update</span></h2>
      <div className="assume">
        <div className="panel">
          <div className="p-head"><div className="title">Return assumptions <span className="tag2">assumed</span></div>
            <button className="btn sm" onClick={() => update((d) => setMc(d, { w: null, ret: { equities: null, bonds: null, cash: 0.5, metals: 1 }, vol: { equities: 17, bonds: 7, cash: 1.5, metals: 15 }, cor: { eqbd: 0.1, eqcash: 0, eqmt: 0.05, bdcash: 0.2, bdmt: 0.1, cashmt: 0 } }))}>Reset to defaults</button></div>
          <div className="tblw tbl-in">
            <table>
              <thead><tr><th className="l">Asset class</th><th>Weight %</th><th>Real ret. %</th><th>Volat. %</th></tr></thead>
              <tbody>
                {KEYS.map((k) => (
                  <tr key={k}>
                    <td className="l">{KEY_LABEL[k]}</td>
                    <td><input type="number" step="0.1" value={a.w[k]} aria-label={`${KEY_LABEL[k]} weight`} onChange={(e) => set({ w: { ...a.w, [k]: e.target.value === '' ? 0 : Number(e.target.value) } })} /></td>
                    <td><input type="number" step="0.1" value={a.ret[k]} aria-label={`${KEY_LABEL[k]} real return`} onChange={(e) => set({ ret: { ...mc.ret, [k]: e.target.value === '' ? 0 : Number(e.target.value) } })} /></td>
                    <td><input type="number" step="0.5" min="0" value={a.vol[k]} aria-label={`${KEY_LABEL[k]} volatility`} onChange={(e) => set({ vol: { ...mc.vol, [k]: Math.max(0, e.target.value === '' ? 0 : Number(e.target.value)) } })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pad sub" data-testid="retsum">
            Mix: <b>{total.toFixed(1)}%</b>{Math.abs(total - 100) > 0.05 ? ' (scaled to 100% for the simulation)' : ''}
            {stats && <> · portfolio average real return about <b>{(stats.avgReturn * 100).toFixed(1)}%</b> a year, typical yearly swing about <b>{(stats.swing * 100).toFixed(1)}%</b>.</>}
          </div>
          <details className="sub">
            <summary>What do these mean?</summary>
            <div className="pad sub"><b>Weights</b> start from your Portfolio holdings (the asset mix of the accounts ticked on the Plan tab) and are rebalanced every year. <b>Real return</b> is the long-run <i>compound</i> return after inflation, so a median path grows at exactly that rate. <b>Volatility</b> is the typical yearly swing. The starting figures are placeholders, not forecasts.</div>
          </details>
        </div>

        <div className="panel">
          <div className="p-head"><div className="title">Correlations <span className="tag2">assumed</span></div></div>
          <div className="tblw tbl-in">
            <table>
              <thead><tr><th className="l" /><th>Bonds</th><th>Cash</th><th>Metals</th></tr></thead>
              <tbody>
                {[['Equities', ['eqbd', 'eqcash', 'eqmt']], ['Bonds', [null, 'bdcash', 'bdmt']], ['Cash', [null, null, 'cashmt']]].map(([n, row]) => (
                  <tr key={n}><td className="l">{n}</td>{row.map((k, j) => k
                    ? <td key={j}><input type="number" step="0.05" min="-1" max="1" value={a.cor[k]} aria-label={`Correlation ${k}`} onChange={(e) => set({ cor: { ...mc.cor, [k]: Math.max(-1, Math.min(1, e.target.value === '' ? 0 : Number(e.target.value))) } })} /></td>
                    : <td key={j} className="ex">—</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {!corOk && (
            <div className="badrow" role="alert" data-testid="corerr">
              These correlations are not mathematically possible together (for example A moves with B and B with C, but A against C).
              <div><button className="btn sm" onClick={() => set({ cor: makeValid(mc.cor) })}>Make valid</button></div>
            </div>
          )}
          <details className="sub"><summary>What is a correlation?</summary><div className="pad sub">How closely two classes move together: 1 = in step, 0 = unrelated, −1 = opposite. Not every combination is mathematically possible; the app checks and tells you.</div></details>
        </div>

        <div className="panel">
          <div className="p-head"><div className="title">Spending rule &amp; simulation</div></div>
          <div className="pad">
            <Row label="Spending rule">
              <select value={mc.rule} aria-label="Spending rule" onChange={(e) => set({ rule: e.target.value })}>
                <option value="fixed">Fixed, inflation-adjusted</option><option value="flex">Flexible: cut in bad years</option>
              </select>
            </Row>
            {mc.rule === 'flex' && <NumRow label="Cut spending by (%)" hint="when the withdrawal rate is 20% above where it started" value={mc.cut} width={80} onChange={(v) => set({ cut: v === '' ? 0 : Math.max(0, Math.min(100, v)) })} />}
            <Row label="Target chance of success">
              <select value={mc.target} aria-label="Target chance of success" onChange={(e) => set({ target: Number(e.target.value) })}>{[70, 80, 85, 90, 95].map((n) => <option key={n}>{n}</option>)}</select>
            </Row>
            <Row label="Number of simulations">
              <select value={mc.n} aria-label="Number of simulations" onChange={(e) => set({ n: Number(e.target.value) })}>{[1000, 5000, 10000].map((n) => <option key={n}>{n}</option>)}</select>
            </Row>
            <Row label="Random seed" hint="same seed, same answer">
              <span className="inl"><input type="number" value={mc.seed} aria-label="Random seed" onChange={(e) => set({ seed: e.target.value === '' ? 1 : Math.floor(Number(e.target.value)) })} />
                <button className="btn sm" onClick={() => set({ seed: Math.floor(Math.random() * 1e6) })}>New draw</button></span>
            </Row>
          </div>
        </div>
      </div>
    </>
  )

  const compare = rows.length > 0 && (
    <div className="panel">
      <div className="p-head"><div className="title">Compare versions</div></div>
      <div className="tblw">
        <table id="cmp" className="t-left">
          <thead><tr><th>Version</th><th className="r">Retire</th><th className="r">Spend/yr</th><th className="r">Chance</th>{!phone && <th className="r">Median at ret.</th>}{!phone && <th className="r">Safe spend</th>}</tr></thead>
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
        <div className="legend pad0">{rows.map((r) => <span key={r.key}><i style={{ background: r.color }} />{r.label} <span className="sub">median path</span></span>)}</div></>}
    </div>
  )

  const how = (
    <div className="panel"><details className="sub"><summary>How it works</summary>
      <div className="pad sub">Each of the simulated futures draws a random real return for each asset class every year (lognormal, correlated as above), applies your contributions until retirement, then withdraws your spending less income, grossed up for tax, at the start of each year. A future “fails” if the money runs out before the plan age. Results are in today's money, so inflation is already stripped out. Estimates only, not financial advice.</div></details></div>
  )

  return (
    <div>
      {planStrip}
      <div className="top">
        <div className="mainc">{results}{fan}{surv}{hist}</div>
        <aside className="side">{versionsPanel}{compare}</aside>
      </div>
      {phone ? <details className="panel fold"><summary>Advanced: assumptions</summary><div className="pad">{assumptions}</div></details> : assumptions}
      {how}
    </div>
  )
}
