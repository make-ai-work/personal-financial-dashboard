import { useVault } from '../finance/VaultContext.jsx'
import StatusBar from '../finance/StatusBar.jsx'
import { useFx } from '../finance/useFx.js'
import { useMemo } from 'react'
import { correlationsValid, portfolioStats } from '../lib/montecarlo.js'
import { planProblems, resolveMc, resolvePlan, runPlan, setMc } from '../lib/retirement.js'
import Assumptions from './Assumptions.jsx'
import Charts from './Charts.jsx'
import Inputs from './Inputs.jsx'
import PlanCards from './PlanCards.jsx'
import Results, { ChanceBox } from './Results.jsx'
import useAnalysis from './useAnalysis.js'

// One page. The left column holds the three saved plans (stacked, in the column's width) and then your inputs. Choosing a plan shows its chance of
// success across the width of the other two columns, with the results and the charts under it. (On a phone: plans, results, charts, inputs.)
export default function RetirementApp() {
  const { data, update } = useVault()
  const fx = useFx(data.settings.countries, data.rates)
  const plan = resolvePlan(data, fx)
  const mc = data.retirement.mc
  const a = resolveMc(mc, plan)
  const problems = planProblems(plan)
  const corOk = correlationsValid(a.cor)
  const { A, busy } = useAnalysis(a, plan, problems.length === 0 && corOk)
  const o = problems.length ? null : runPlan(plan)
  const setMcPatch = (patch) => update((d) => setMc(d, patch))
  const total = ['equities', 'bonds', 'cash', 'metals'].reduce((sum, k) => sum + (Number(a.w[k]) || 0), 0)
  const stats = useMemo(() => (corOk ? portfolioStats(a) : null), [JSON.stringify(a), corOk]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="wide-pad">
      <StatusBar />
      {fx.loading && <div className="banner" style={{ marginBottom: 12 }}>Fetching exchange rates…</div>}
      <div className="rgrid">
        <div className="rg-plans"><PlanCards A={A} plan={plan} target={a.target} busy={busy} /></div>
        <div className="rg-main">
          <ChanceBox plan={plan} a={a} o={o} A={A} busy={busy} problems={problems} corOk={corOk} />
          <div className="rsub">
            <div className="rc rc-mid"><Results plan={plan} a={a} o={o} A={A} busy={busy} problems={problems} corOk={corOk} /></div>
            <div className="rc rc-ch"><Charts plan={plan} a={a} A={A} o={o} /></div>
          </div>
        </div>
        <div className="rc rg-in rc-in"><Inputs plan={plan} fx={fx} /></div>
      </div>
      <details className="panel fold" id="r-advanced" style={{ marginTop: 14 }}>
        <summary>Advanced: volatility, correlations, spending rule, target chance and number of runs</summary>
        <div className="pad"><Assumptions mc={mc} a={a} corOk={corOk} stats={stats} total={total} set={setMcPatch} update={update} /></div>
      </details>
    </div>
  )
}
