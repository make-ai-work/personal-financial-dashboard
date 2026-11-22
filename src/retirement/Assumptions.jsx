import { KEYS, KEY_LABEL, makeValid } from '../lib/montecarlo.js'
import { setMc } from '../lib/retirement.js'
import { NumRow, Row } from './fields.jsx'

// Everything that used to be on the Monte Carlo tab: return assumptions, correlations, the spending rule, target chance, number of runs and the seed.
// Shown folded under Market conditions → Advanced. Changing any of it updates the results on the page.
export default function Assumptions({ mc, a, corOk, stats, total, set, update }) {
  return (
    <>
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
}
