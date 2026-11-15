import { useState } from 'react'
import { useVault } from '../finance/VaultContext.jsx'
import StatusBar from '../finance/StatusBar.jsx'
import { useFx } from '../finance/useFx.js'
import { resolvePlan } from '../lib/retirement.js'
import PlanPage from './PlanPage.jsx'
import MonteCarlo from './MonteCarlo.jsx'

export default function RetirementApp() {
  const { data } = useVault()
  const [tab, setTab] = useState('plan')
  const fx = useFx(data.settings.countries, data.rates)
  const plan = resolvePlan(data, fx)
  return (
    <>
      <StatusBar />
      <nav className="subtabs">
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>Plan</button>
        <button className={tab === 'mc' ? 'on' : ''} onClick={() => setTab('mc')}>Monte Carlo</button>
      </nav>
      <div className="subpage">
        {fx.loading && <div className="banner" style={{ marginBottom: 12 }}>Fetching exchange rates…</div>}
        {tab === 'plan' ? <PlanPage plan={plan} fx={fx} /> : <MonteCarlo plan={plan} />}
      </div>
    </>
  )
}
